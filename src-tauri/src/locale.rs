use serde::{Deserialize, Serialize};
use specta::Type;

const DEFAULT_APP_LOCALE: AppLocale = AppLocale::EnUs;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum AppLocale {
    #[serde(rename = "en-US")]
    EnUs,
    #[serde(rename = "zh-CN")]
    ZhCn,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AppLocaleMode {
    #[default]
    Manual,
    System,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppLocalePreference {
    #[serde(default)]
    pub mode: AppLocaleMode,
    #[serde(default)]
    pub locale: Option<AppLocale>,
}

impl Default for AppLocalePreference {
    fn default() -> Self {
        Self {
            mode: AppLocaleMode::Manual,
            locale: Some(DEFAULT_APP_LOCALE),
        }
    }
}

impl AppLocalePreference {
    pub fn normalized(mut self) -> Self {
        match self.mode {
            AppLocaleMode::System => {
                self.mode = AppLocaleMode::Manual;
                self.locale = Some(DEFAULT_APP_LOCALE);
            }
            AppLocaleMode::Manual if self.locale.is_none() => {
                self.locale = Some(DEFAULT_APP_LOCALE);
            }
            AppLocaleMode::Manual => {}
        }

        self
    }

    pub fn resolved(&self) -> AppLocale {
        self.clone()
            .normalized()
            .locale
            .unwrap_or(DEFAULT_APP_LOCALE)
    }
}

pub struct LocalizedShellStrings {
    pub clipboard_window_title: &'static str,
    pub tray_clipboard: &'static str,
    pub tray_open: &'static str,
    pub tray_quit: &'static str,
    pub tray_tooltip: &'static str,
}

pub fn localized_shell_strings(locale: AppLocale) -> LocalizedShellStrings {
    match locale {
        AppLocale::EnUs => LocalizedShellStrings {
            clipboard_window_title: "Clipboard",
            tray_clipboard: "Clipboard",
            tray_open: "Open Tino",
            tray_quit: "Quit",
            tray_tooltip: "Tino",
        },
        AppLocale::ZhCn => LocalizedShellStrings {
            clipboard_window_title: "剪贴板",
            tray_clipboard: "剪贴板",
            tray_open: "打开 Tino",
            tray_quit: "退出",
            tray_tooltip: "Tino",
        },
    }
}
