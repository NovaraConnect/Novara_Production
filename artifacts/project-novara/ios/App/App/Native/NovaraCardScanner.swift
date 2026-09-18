import UIKit
import AVFoundation
import Vision
import VisionKit

/// Native business-card capture.
///
/// WHAT THIS REPLACES, AND WHAT IT DELIBERATELY DOES NOT.
///
/// The web app's scanner (src/components/BusinessCardScanner.tsx) asks a hidden
/// `<input type="file" capture="environment">` for a photo and then runs
/// tesseract.js over it, downloading a WebAssembly OCR engine from a CDN on
/// first use. Inside the app that meant a plain system photo sheet, a 5–15
/// second wait, and no scan at all without a network.
///
/// The native flow replaces the two device-specific steps — *capture* and *text
/// recognition* — with VisionKit's document scanner (live edge detection,
/// perspective correction, glare handling, front and back in one session) and
/// the Vision framework's on-device OCR. Nothing leaves the phone to produce
/// the text, and it takes well under a second.
///
/// Everything downstream is untouched and still owned by Novara's existing
/// services: the recognised TEXT is handed back to the web app, which runs the
/// same `extractContactFields()` parser, the same optional
/// `POST /api/parse-card-text` AI refinement, the same review-before-save form,
/// and the same `POST /api/contacts`. The browser keeps using tesseract.js.
final class NovaraCardScanner: NSObject {

    enum ScanError: LocalizedError {
        case cameraDenied
        case unavailable
        case noText

        var errorDescription: String? {
            switch self {
            case .cameraDenied:
                return "Novara needs camera access to scan a card. You can allow it in iOS Settings, or choose Enter manually."
            case .unavailable:
                return "Card scanning isn't available on this device."
            case .noText:
                return "No text was found on that card — try again with more light, or enter the details manually."
            }
        }
    }

    private weak var presenter: UIViewController?
    private var completion: ((Result<Any, Error>) -> Void)?
    private var retainedSelf: NovaraCardScanner?

    func present(from presenter: UIViewController, completion: @escaping (Result<Any, Error>) -> Void) {
        self.presenter = presenter
        self.completion = completion
        self.retainedSelf = self

        guard VNDocumentCameraViewController.isSupported else {
            finish(.failure(ScanError.unavailable))
            return
        }

        // Check first rather than letting the scanner open onto a black frame:
        // a denied camera is a state the user has to be told about, with a way
        // out, not a broken-looking screen.
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            presentScanner()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    granted ? self?.presentScanner() : self?.finish(.failure(ScanError.cameraDenied))
                }
            }
        default:
            finish(.failure(ScanError.cameraDenied))
        }
    }

    private func presentScanner() {
        guard let presenter = presenter else {
            finish(.failure(ScanError.unavailable))
            return
        }
        let scanner = VNDocumentCameraViewController()
        scanner.delegate = self
        presenter.present(scanner, animated: true)
    }

    private func finish(_ result: Result<Any, Error>) {
        let callback = completion
        completion = nil
        retainedSelf = nil
        callback?(result)
    }

    // MARK: - Recognition

    /// Runs Vision text recognition over every scanned page and returns the
    /// lines in reading order.
    ///
    /// Reading order matters: `extractContactFields()` is a line-oriented
    /// parser that treats "the line after the name" as the role. Vision returns
    /// observations in no guaranteed order, so they are sorted top-to-bottom
    /// (normalised coordinates put the origin at the bottom-left, hence the
    /// descending y) and then left-to-right.
    static func recognizeText(in images: [UIImage]) -> String {
        var lines: [String] = []

        for image in images {
            guard let cgImage = image.cgImage else { continue }

            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            // Business cards are names, companies and emails, not prose. Language
            // correction "fixes" surnames and domains into ordinary words.
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]

            let handler = VNImageRequestHandler(cgImage: cgImage, orientation: cgOrientation(of: image), options: [:])
            do {
                try handler.perform([request])
            } catch {
                continue
            }

            let observations = (request.results ?? [])
                .sorted { lhs, rhs in
                    let dy = rhs.boundingBox.midY - lhs.boundingBox.midY
                    // Treat text within ~2% of the same height as one row.
                    if abs(dy) > 0.02 { return dy < 0 }
                    return lhs.boundingBox.minX < rhs.boundingBox.minX
                }

            for observation in observations {
                guard let candidate = observation.topCandidates(1).first else { continue }
                let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { lines.append(text) }
            }
        }

        return lines.joined(separator: "\n")
    }

    private static func cgOrientation(of image: UIImage) -> CGImagePropertyOrientation {
        switch image.imageOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}

extension NovaraCardScanner: VNDocumentCameraViewControllerDelegate {

    func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                      didFinishWith scan: VNDocumentCameraScan) {
        // Capture the pages before dismissing; `scan` is not valid afterwards.
        var images: [UIImage] = []
        for index in 0..<scan.pageCount {
            images.append(scan.imageOfPage(at: index))
        }

        controller.dismiss(animated: true) { [weak self] in
            DispatchQueue.global(qos: .userInitiated).async {
                let text = NovaraCardScanner.recognizeText(in: images)
                DispatchQueue.main.async {
                    guard text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 5 else {
                        self?.finish(.failure(ScanError.noText))
                        return
                    }
                    self?.finish(.success(["text": text, "pages": images.count]))
                }
            }
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true) { [weak self] in
            self?.finish(.success(["cancelled": true]))
        }
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                      didFailWithError error: Error) {
        controller.dismiss(animated: true) { [weak self] in
            self?.finish(.failure(error))
        }
    }
}
