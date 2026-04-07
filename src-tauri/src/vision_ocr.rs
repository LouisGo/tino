#[cfg(target_os = "macos")]
use objc2::{
    encode::{Encode, Encoding, RefEncode},
    exception::catch as catch_objc_exception,
    extern_class, extern_methods,
    rc::{autoreleasepool, Allocated, Retained},
    runtime::{AnyObject, NSObject},
    AnyThread, ClassType,
};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSArray, NSData, NSDictionary, NSError, NSInteger, NSString};

#[cfg(target_os = "macos")]
const OCR_LANGUAGE_CODES: [&str; 3] = ["zh-Hans", "zh-Hant", "en-US"];

#[cfg(target_os = "macos")]
#[link(name = "Vision", kind = "framework")]
unsafe extern "C" {}

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(NSObject))]
    #[derive(Debug, PartialEq, Eq, Hash)]
    pub struct VNRequest;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(VNRequest))]
    #[derive(Debug, PartialEq, Eq, Hash)]
    pub struct VNImageBasedRequest;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(VNImageBasedRequest))]
    #[derive(Debug, PartialEq, Eq, Hash)]
    pub struct VNRecognizeTextRequest;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(NSObject))]
    #[derive(Debug, PartialEq, Eq, Hash)]
    pub struct VNRequestHandler;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(VNRequestHandler))]
    #[derive(Debug, PartialEq, Eq, Hash)]
    pub struct VNImageRequestHandler;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(NSObject))]
    #[derive(Debug, PartialEq, Eq, Hash)]
    pub struct VNObservation;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(VNObservation))]
    #[derive(Debug, PartialEq, Eq, Hash)]
    pub struct VNRecognizedTextObservation;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(NSObject))]
    #[derive(Debug, PartialEq, Eq, Hash)]
    pub struct VNRecognizedText;
);

#[cfg(target_os = "macos")]
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct VNRequestTextRecognitionLevel(pub NSInteger);

#[cfg(target_os = "macos")]
impl VNRequestTextRecognitionLevel {
    pub const ACCURATE: Self = Self(0);
}

#[cfg(target_os = "macos")]
unsafe impl Encode for VNRequestTextRecognitionLevel {
    const ENCODING: Encoding = NSInteger::ENCODING;
}

#[cfg(target_os = "macos")]
unsafe impl RefEncode for VNRequestTextRecognitionLevel {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

#[cfg(target_os = "macos")]
#[allow(non_snake_case)]
impl VNRecognizeTextRequest {
    extern_methods!(
        #[unsafe(method(results))]
        #[unsafe(method_family = none)]
        pub fn results(&self) -> Option<Retained<NSArray<VNRecognizedTextObservation>>>;

        #[unsafe(method(setRecognitionLanguages:))]
        #[unsafe(method_family = none)]
        pub fn setRecognitionLanguages(&self, value: &NSArray<NSString>);

        #[unsafe(method(setRecognitionLevel:))]
        #[unsafe(method_family = none)]
        pub fn setRecognitionLevel(&self, value: VNRequestTextRecognitionLevel);

        #[unsafe(method(setUsesLanguageCorrection:))]
        #[unsafe(method_family = none)]
        pub fn setUsesLanguageCorrection(&self, value: bool);

        #[unsafe(method(new))]
        #[unsafe(method_family = new)]
        pub fn new() -> Retained<Self>;
    );
}

#[cfg(target_os = "macos")]
#[allow(non_snake_case)]
impl VNImageRequestHandler {
    extern_methods!(
        #[unsafe(method(initWithData:options:))]
        #[unsafe(method_family = init)]
        pub unsafe fn initWithData_options(
            this: Allocated<Self>,
            image_data: &NSData,
            options: &NSDictionary<AnyObject, AnyObject>,
        ) -> Option<Retained<Self>>;

        #[unsafe(method(performRequests:error:_))]
        #[unsafe(method_family = none)]
        pub unsafe fn performRequests_error(
            &self,
            requests: &NSArray<VNRequest>,
        ) -> Result<(), Retained<NSError>>;
    );
}

#[cfg(target_os = "macos")]
#[allow(non_snake_case)]
impl VNRecognizedTextObservation {
    extern_methods!(
        #[unsafe(method(topCandidates:))]
        #[unsafe(method_family = none)]
        pub fn topCandidates(
            &self,
            maximum_candidate_count: usize,
        ) -> Retained<NSArray<VNRecognizedText>>;
    );
}

#[cfg(target_os = "macos")]
impl VNRecognizedText {
    extern_methods!(
        #[unsafe(method(string))]
        #[unsafe(method_family = none)]
        pub fn string(&self) -> Retained<NSString>;
    );
}

#[cfg(target_os = "macos")]
pub fn recognize_text_from_image_path(
    image_path: &std::path::Path,
) -> Result<Option<String>, String> {
    let image_bytes = std::fs::read(image_path).map_err(|error| error.to_string())?;
    if image_bytes.is_empty() {
        return Ok(None);
    }

    let result = catch_objc_exception(|| {
        autoreleasepool(|_| {
            let image_data = NSData::from_vec(image_bytes);
            let request = VNRecognizeTextRequest::new();
            request.setRecognitionLevel(VNRequestTextRecognitionLevel::ACCURATE);
            request.setUsesLanguageCorrection(true);

            let languages = OCR_LANGUAGE_CODES.map(NSString::from_str);
            let language_refs = languages
                .iter()
                .map(|language| language.as_ref())
                .collect::<Vec<_>>();
            let languages = NSArray::from_slice(&language_refs);
            request.setRecognitionLanguages(&languages);

            let options = NSDictionary::new();
            let handler = unsafe {
                VNImageRequestHandler::initWithData_options(
                    VNImageRequestHandler::alloc(),
                    &image_data,
                    &options,
                )
            }
            .ok_or_else(|| "failed to create Vision image request handler".to_string())?;

            let requests: Retained<NSArray<VNRequest>> = NSArray::from_slice(&[request.as_super()]);
            unsafe { handler.performRequests_error(&requests) }.map_err(ns_error_message)?;

            let Some(results) = request.results() else {
                return Ok(None);
            };

            let mut lines = Vec::new();
            for index in 0..results.count() {
                let observation = results.objectAtIndex(index);
                let candidates = observation.topCandidates(1);
                let Some(candidate) = candidates.firstObject() else {
                    continue;
                };
                let text = candidate.string().to_string();
                let normalized = text.trim();
                if !normalized.is_empty() {
                    lines.push(normalized.to_string());
                }
            }

            let joined = lines.join("\n");
            let normalized = joined.trim();
            if normalized.is_empty() {
                Ok(None)
            } else {
                Ok(Some(normalized.to_string()))
            }
        })
    });

    match result {
        Ok(value) => value,
        Err(Some(exception)) => Err(exception.to_string()),
        Err(None) => Err("Vision OCR raised an unknown Objective-C exception".to_string()),
    }
}

#[cfg(target_os = "macos")]
fn ns_error_message(error: Retained<NSError>) -> String {
    error.localizedDescription().to_string()
}

#[cfg(not(target_os = "macos"))]
pub fn recognize_text_from_image_path(
    _image_path: &std::path::Path,
) -> Result<Option<String>, String> {
    Ok(None)
}
