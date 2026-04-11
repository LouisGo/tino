use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;
pub type IpcResult<T> = Result<T, IpcError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum IpcErrorCode {
    ValidationError,
    StateConflict,
    NotFound,
    PermissionRequired,
    PackagedAppRequired,
    LocalSigningRequired,
    SignatureInvalid,
    IoError,
    PlatformError,
    InternalError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: IpcErrorCode,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{message}")]
    Validation { message: String },
    #[error("{message}")]
    StateConflict { message: String },
    #[error("{message}")]
    NotFound { message: String },
    #[error("{message}")]
    PermissionRequired {
        message: String,
        details: Option<String>,
    },
    #[error("{message}")]
    PackagedAppRequired {
        message: String,
        details: Option<String>,
    },
    #[error("{message}")]
    LocalSigningRequired {
        message: String,
        details: Option<String>,
    },
    #[error("{message}")]
    SignatureInvalid {
        message: String,
        details: Option<String>,
    },
    #[error("{message}: {source}")]
    Io {
        message: &'static str,
        #[source]
        source: std::io::Error,
    },
    #[error("{message}: {source}")]
    Json {
        message: &'static str,
        #[source]
        source: serde_json::Error,
    },
    #[error("{message}")]
    Platform {
        message: String,
        details: Option<String>,
    },
    #[error("{message}")]
    Internal {
        message: String,
        details: Option<String>,
    },
}

impl AppError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation {
            message: message.into(),
        }
    }

    pub fn state_conflict(message: impl Into<String>) -> Self {
        Self::StateConflict {
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound {
            message: message.into(),
        }
    }

    pub fn permission_required(message: impl Into<String>) -> Self {
        Self::PermissionRequired {
            message: message.into(),
            details: None,
        }
    }

    pub fn packaged_app_required(message: impl Into<String>) -> Self {
        Self::PackagedAppRequired {
            message: message.into(),
            details: None,
        }
    }

    pub fn local_signing_required(message: impl Into<String>) -> Self {
        Self::LocalSigningRequired {
            message: message.into(),
            details: None,
        }
    }

    pub fn signature_invalid(message: impl Into<String>) -> Self {
        Self::SignatureInvalid {
            message: message.into(),
            details: None,
        }
    }

    pub fn io(message: &'static str, source: std::io::Error) -> Self {
        Self::Io { message, source }
    }

    pub fn json(message: &'static str, source: serde_json::Error) -> Self {
        Self::Json { message, source }
    }

    pub fn platform(message: impl Into<String>) -> Self {
        Self::Platform {
            message: message.into(),
            details: None,
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
            details: None,
        }
    }

    fn code(&self) -> IpcErrorCode {
        match self {
            Self::Validation { .. } => IpcErrorCode::ValidationError,
            Self::StateConflict { .. } => IpcErrorCode::StateConflict,
            Self::NotFound { .. } => IpcErrorCode::NotFound,
            Self::PermissionRequired { .. } => IpcErrorCode::PermissionRequired,
            Self::PackagedAppRequired { .. } => IpcErrorCode::PackagedAppRequired,
            Self::LocalSigningRequired { .. } => IpcErrorCode::LocalSigningRequired,
            Self::SignatureInvalid { .. } => IpcErrorCode::SignatureInvalid,
            Self::Io { .. } => IpcErrorCode::IoError,
            Self::Platform { .. } => IpcErrorCode::PlatformError,
            Self::Json { .. } | Self::Internal { .. } => IpcErrorCode::InternalError,
        }
    }

    fn message(&self) -> String {
        match self {
            Self::Validation { message }
            | Self::StateConflict { message }
            | Self::NotFound { message }
            | Self::PermissionRequired { message, .. }
            | Self::PackagedAppRequired { message, .. }
            | Self::LocalSigningRequired { message, .. }
            | Self::SignatureInvalid { message, .. }
            | Self::Platform { message, .. }
            | Self::Internal { message, .. } => message.clone(),
            Self::Io { message, .. } | Self::Json { message, .. } => (*message).to_string(),
        }
    }

    fn details(&self) -> Option<String> {
        match self {
            Self::PermissionRequired { details, .. }
            | Self::PackagedAppRequired { details, .. }
            | Self::LocalSigningRequired { details, .. }
            | Self::SignatureInvalid { details, .. }
            | Self::Platform { details, .. }
            | Self::Internal { details, .. } => details.clone(),
            Self::Io { source, .. } => Some(source.to_string()),
            Self::Json { source, .. } => Some(source.to_string()),
            Self::Validation { .. } | Self::StateConflict { .. } | Self::NotFound { .. } => None,
        }
    }
}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        Self::internal(message)
    }
}

impl From<AppError> for IpcError {
    fn from(error: AppError) -> Self {
        Self {
            code: error.code(),
            message: error.message(),
            details: error.details(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AppError, IpcError, IpcErrorCode};

    #[test]
    fn maps_permission_required_error_to_ipc_error() {
        let error = IpcError::from(AppError::permission_required(
            "Accessibility permission is required",
        ));

        assert_eq!(error.code, IpcErrorCode::PermissionRequired);
        assert_eq!(error.message, "Accessibility permission is required");
        assert_eq!(error.details, None);
    }

    #[test]
    fn includes_io_details_in_ipc_error() {
        let error = IpcError::from(AppError::io(
            "failed to read stored AI batch file",
            std::io::Error::new(std::io::ErrorKind::NotFound, "batch file missing"),
        ));

        assert_eq!(error.code, IpcErrorCode::IoError);
        assert_eq!(error.message, "failed to read stored AI batch file");
        assert_eq!(error.details.as_deref(), Some("batch file missing"));
    }
}
