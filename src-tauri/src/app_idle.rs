use log::warn;
use std::{
    collections::{HashSet, VecDeque},
    panic::AssertUnwindSafe,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

const APP_IDLE_QUIESCENCE_MS: u64 = 1_250;
const APP_TASK_SCHEDULER_TICK_MS: u64 = 250;

type ScheduledTask = Box<dyn FnOnce() + Send + 'static>;

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TaskPriority {
    UserInitiated,
    Background,
    Idle,
}

enum SchedulerMessage {
    Schedule {
        priority: TaskPriority,
        task: ScheduledTask,
    },
    TaskCompleted {
        priority: TaskPriority,
    },
    RecordUserActivity,
    WindowFocusChanged {
        label: String,
        focused: bool,
    },
}

#[derive(Clone)]
pub struct AppTaskScheduler {
    sender: mpsc::Sender<SchedulerMessage>,
}

impl std::fmt::Debug for AppTaskScheduler {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppTaskScheduler").finish_non_exhaustive()
    }
}

impl AppTaskScheduler {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        spawn_task_scheduler_worker(receiver, sender.clone());
        Self { sender }
    }

    pub fn schedule<F>(&self, priority: TaskPriority, task: F) -> Result<(), String>
    where
        F: FnOnce() + Send + 'static,
    {
        self.sender
            .send(SchedulerMessage::Schedule {
                priority,
                task: Box::new(task),
            })
            .map_err(|error| error.to_string())
    }

    pub fn record_user_activity(&self) -> Result<(), String> {
        self.sender
            .send(SchedulerMessage::RecordUserActivity)
            .map_err(|error| error.to_string())
    }

    pub fn update_window_focus(&self, label: &str, focused: bool) -> Result<(), String> {
        self.sender
            .send(SchedulerMessage::WindowFocusChanged {
                label: label.to_string(),
                focused,
            })
            .map_err(|error| error.to_string())
    }
}

#[derive(Default)]
struct PendingTaskQueues {
    user_initiated: VecDeque<ScheduledTask>,
    background: VecDeque<ScheduledTask>,
    idle: VecDeque<ScheduledTask>,
}

impl PendingTaskQueues {
    fn is_empty(&self) -> bool {
        self.user_initiated.is_empty() && self.background.is_empty() && self.idle.is_empty()
    }

    fn push(&mut self, priority: TaskPriority, task: ScheduledTask) {
        match priority {
            TaskPriority::UserInitiated => self.user_initiated.push_back(task),
            TaskPriority::Background => self.background.push_back(task),
            TaskPriority::Idle => self.idle.push_back(task),
        }
    }

    fn pop_next(
        &mut self,
        state: &SchedulerState,
        in_flight: &InFlightTasks,
    ) -> Option<(TaskPriority, ScheduledTask)> {
        if !in_flight.user_initiated {
            if let Some(task) = self.user_initiated.pop_front() {
                return Some((TaskPriority::UserInitiated, task));
            }
        }

        if self.user_initiated.is_empty() && !in_flight.user_initiated && !in_flight.background {
            if state.can_run_background() {
                if let Some(task) = self.background.pop_front() {
                    return Some((TaskPriority::Background, task));
                }
            }
        }

        if self.user_initiated.is_empty()
            && self.background.is_empty()
            && !in_flight.user_initiated
            && !in_flight.background
            && !in_flight.idle
            && state.is_idle()
        {
            if let Some(task) = self.idle.pop_front() {
                return Some((TaskPriority::Idle, task));
            }
        }

        None
    }
}

#[derive(Default)]
struct InFlightTasks {
    user_initiated: bool,
    background: bool,
    idle: bool,
}

impl InFlightTasks {
    fn start(&mut self, priority: TaskPriority) {
        match priority {
            TaskPriority::UserInitiated => self.user_initiated = true,
            TaskPriority::Background => self.background = true,
            TaskPriority::Idle => self.idle = true,
        }
    }

    fn finish(&mut self, priority: TaskPriority) {
        match priority {
            TaskPriority::UserInitiated => self.user_initiated = false,
            TaskPriority::Background => self.background = false,
            TaskPriority::Idle => self.idle = false,
        }
    }
}

struct SchedulerState {
    focused_window_labels: HashSet<String>,
    last_user_activity_at: Instant,
}

impl SchedulerState {
    fn new() -> Self {
        Self {
            focused_window_labels: HashSet::new(),
            last_user_activity_at: Instant::now(),
        }
    }

    fn record_user_activity(&mut self) {
        self.last_user_activity_at = Instant::now();
    }

    fn update_window_focus(&mut self, label: String, focused: bool) {
        if focused {
            self.focused_window_labels.insert(label);
        } else {
            self.focused_window_labels.remove(&label);
        }
        self.record_user_activity();
    }

    fn can_run_background(&self) -> bool {
        self.focused_window_labels.is_empty()
    }

    fn is_idle(&self) -> bool {
        self.can_run_background()
            && self.last_user_activity_at.elapsed() >= Duration::from_millis(APP_IDLE_QUIESCENCE_MS)
    }
}

fn spawn_task_scheduler_worker(
    receiver: mpsc::Receiver<SchedulerMessage>,
    sender: mpsc::Sender<SchedulerMessage>,
) {
    thread::spawn(move || {
        let mut state = SchedulerState::new();
        let mut queues = PendingTaskQueues::default();
        let mut in_flight = InFlightTasks::default();

        loop {
            if queues.is_empty() {
                let Ok(message) = receiver.recv() else {
                    return;
                };
                apply_scheduler_message(message, &mut state, &mut queues, &mut in_flight);
            }

            while let Ok(message) = receiver.try_recv() {
                apply_scheduler_message(message, &mut state, &mut queues, &mut in_flight);
            }

            if let Some((priority, task)) = queues.pop_next(&state, &in_flight) {
                in_flight.start(priority);
                dispatch_scheduled_task(priority, task, sender.clone());
                continue;
            }

            match receiver.recv_timeout(Duration::from_millis(APP_TASK_SCHEDULER_TICK_MS)) {
                Ok(message) => {
                    apply_scheduler_message(message, &mut state, &mut queues, &mut in_flight)
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    if queues.is_empty()
                        && !in_flight.user_initiated
                        && !in_flight.background
                        && !in_flight.idle
                    {
                        return;
                    }
                }
            }
        }
    });
}

fn apply_scheduler_message(
    message: SchedulerMessage,
    state: &mut SchedulerState,
    queues: &mut PendingTaskQueues,
    in_flight: &mut InFlightTasks,
) {
    match message {
        SchedulerMessage::Schedule { priority, task } => queues.push(priority, task),
        SchedulerMessage::TaskCompleted { priority } => in_flight.finish(priority),
        SchedulerMessage::RecordUserActivity => state.record_user_activity(),
        SchedulerMessage::WindowFocusChanged { label, focused } => {
            state.update_window_focus(label, focused)
        }
    }
}

fn dispatch_scheduled_task(
    priority: TaskPriority,
    task: ScheduledTask,
    sender: mpsc::Sender<SchedulerMessage>,
) {
    thread::spawn(move || {
        let result = std::panic::catch_unwind(AssertUnwindSafe(task));
        if let Err(payload) = result {
            warn!(
                "scheduled task panicked: {}",
                panic_payload_message(&payload)
            );
        }
        let _ = sender.send(SchedulerMessage::TaskCompleted { priority });
    });
}

fn panic_payload_message(payload: &Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return (*message).to_string();
    }
    "unknown panic payload".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn idle_task_waits_until_app_is_unfocused_and_quiet() {
        let scheduler = AppTaskScheduler::new();
        let (started_tx, started_rx) = mpsc::channel();

        scheduler
            .update_window_focus("main", true)
            .expect("focus update should succeed");
        scheduler
            .schedule(TaskPriority::Idle, move || {
                let _ = started_tx.send(());
            })
            .expect("idle task should schedule");

        assert!(
            started_rx
                .recv_timeout(Duration::from_millis(APP_IDLE_QUIESCENCE_MS + 300))
                .is_err(),
            "idle task should not run while Tino stays focused"
        );

        scheduler
            .update_window_focus("main", false)
            .expect("focus clear should succeed");

        started_rx
            .recv_timeout(Duration::from_millis(APP_IDLE_QUIESCENCE_MS + 800))
            .expect("idle task should run after focus clears and quiescence elapses");
    }

    #[test]
    fn user_task_is_not_blocked_by_running_idle_task() {
        let scheduler = AppTaskScheduler::new();
        let (idle_started_tx, idle_started_rx) = mpsc::channel();
        let (idle_release_tx, idle_release_rx) = mpsc::channel();
        let (user_done_tx, user_done_rx) = mpsc::channel();

        scheduler
            .schedule(TaskPriority::Idle, move || {
                let _ = idle_started_tx.send(());
                let _ = idle_release_rx.recv();
            })
            .expect("idle task should schedule");

        idle_started_rx
            .recv_timeout(Duration::from_millis(APP_IDLE_QUIESCENCE_MS + 800))
            .expect("idle task should eventually start");

        scheduler
            .schedule(TaskPriority::UserInitiated, move || {
                let _ = user_done_tx.send(());
            })
            .expect("user task should schedule");

        user_done_rx
            .recv_timeout(Duration::from_millis(500))
            .expect("user task should not be blocked by running idle task");

        idle_release_tx
            .send(())
            .expect("idle release should succeed");
    }
}
