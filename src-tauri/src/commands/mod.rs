use crate::error::{AppError, IpcError, IpcResult};

pub mod ai;
pub mod chat;
pub mod shell;

pub(crate) async fn run_blocking_command<T, E, F>(operation: F) -> Result<T, E>
where
    T: Send + 'static,
    E: From<String> + Send + 'static,
    F: FnOnce() -> Result<T, E> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| E::from(error.to_string()))?
}

pub(crate) async fn run_blocking_ipc_command<T, F>(operation: F) -> IpcResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> IpcResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| IpcError::from(AppError::internal(error.to_string())))?
}
