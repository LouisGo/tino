use crate::window_state::PersistedPanelWindowState;

#[derive(Debug, Clone, Copy)]
pub(crate) struct LogicalDisplayFrame {
    pub(crate) height: f64,
    pub(crate) width: f64,
    pub(crate) x: f64,
    pub(crate) y: f64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct PanelWindowLayout {
    pub(crate) height: f64,
    pub(crate) width: f64,
    pub(crate) x: f64,
    pub(crate) y: f64,
}

pub(crate) fn resolve_panel_window_layout(
    window_size: (f64, f64),
    min_size: Option<(f64, f64)>,
    max_size: Option<(f64, f64)>,
    display: &LogicalDisplayFrame,
    persisted: Option<&PersistedPanelWindowState>,
) -> PanelWindowLayout {
    let default_width = window_size.0.min(display.width);
    let default_height = window_size.1.min(display.height);

    let min_width = min_size.map(|size| size.0).unwrap_or(200.0);
    let min_height = min_size.map(|size| size.1).unwrap_or(120.0);
    let max_width = max_size.map(|size| size.0).unwrap_or(display.width);
    let max_height = max_size.map(|size| size.1).unwrap_or(display.height);

    let width = persisted
        .map(|state| state.width)
        .unwrap_or(default_width)
        .clamp(min_width.min(display.width), max_width.min(display.width));
    let height = persisted
        .map(|state| state.height)
        .unwrap_or(default_height)
        .clamp(
            min_height.min(display.height),
            max_height.min(display.height),
        );
    let max_offset_x = (display.width - width).max(0.0);
    let max_offset_y = (display.height - height).max(0.0);
    let default_offset_x = ((display.width - width) / 2.0)
        .max(0.0)
        .clamp(0.0, max_offset_x);
    let default_offset_y = ((display.height - height) / 2.0)
        .max(0.0)
        .clamp(0.0, max_offset_y);

    let offset_x = persisted
        .map(|state| state.offset_x)
        .unwrap_or(default_offset_x)
        .clamp(0.0, max_offset_x);
    let offset_y = persisted
        .map(|state| state.offset_y)
        .unwrap_or(default_offset_y)
        .clamp(0.0, max_offset_y);

    PanelWindowLayout {
        height,
        width,
        x: display.x + offset_x,
        y: display.y + offset_y,
    }
}
