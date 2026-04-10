#[cfg(target_os = "macos")]
use objc2::{exception::catch as catch_objc_exception, rc::autoreleasepool, AnyThread};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
#[cfg(target_os = "macos")]
use objc2_av_foundation::{AVAsset, AVAssetImageGenerator};
#[cfg(target_os = "macos")]
use objc2_core_foundation::CGSize;
#[cfg(target_os = "macos")]
use objc2_core_media::kCMTimeZero;
#[cfg(target_os = "macos")]
use objc2_foundation::{NSDictionary, NSError, NSString, NSURL};

#[cfg(target_os = "macos")]
#[allow(deprecated)]
pub fn generate_video_thumbnail_png(
    video_path: &std::path::Path,
    max_edge: f64,
) -> Result<Option<Vec<u8>>, String> {
    if !video_path.exists() {
        return Ok(None);
    }

    let result = catch_objc_exception(|| {
        autoreleasepool(|_| {
            let path = NSString::from_str(&video_path.to_string_lossy());
            let url = NSURL::fileURLWithPath(&path);
            let asset = unsafe { AVAsset::assetWithURL(&url) };
            let generator = unsafe { AVAssetImageGenerator::assetImageGeneratorWithAsset(&asset) };

            unsafe {
                generator.setAppliesPreferredTrackTransform(true);
                generator.setMaximumSize(CGSize::new(max_edge, max_edge));
                generator.setRequestedTimeToleranceBefore(kCMTimeZero);
                generator.setRequestedTimeToleranceAfter(kCMTimeZero);
            }

            let cg_image = unsafe {
                generator.copyCGImageAtTime_actualTime_error(kCMTimeZero, std::ptr::null_mut())
            }
            .map_err(ns_error_message)?;

            let bitmap_rep =
                NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg_image);
            let properties = NSDictionary::new();
            let Some(png_data) = (unsafe {
                bitmap_rep
                    .representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
            }) else {
                return Ok(None);
            };

            let bytes = png_data.to_vec();
            if bytes.is_empty() {
                Ok(None)
            } else {
                Ok(Some(bytes))
            }
        })
    });

    match result {
        Ok(value) => value,
        Err(Some(exception)) => Err(exception.to_string()),
        Err(None) => Err(
            "AVFoundation thumbnail extraction raised an unknown Objective-C exception".to_string(),
        ),
    }
}

#[cfg(target_os = "macos")]
fn ns_error_message(error: objc2::rc::Retained<NSError>) -> String {
    error.localizedDescription().to_string()
}

#[cfg(not(target_os = "macos"))]
pub fn generate_video_thumbnail_png(
    _video_path: &std::path::Path,
    _max_edge: f64,
) -> Result<Option<Vec<u8>>, String> {
    Ok(None)
}
