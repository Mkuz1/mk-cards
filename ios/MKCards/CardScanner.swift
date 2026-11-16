import UIKit
import Vision
import VisionKit

/// The camera for business cards and badges. Cards use Apple's document camera (finds the card's edges and
/// straightens it); the text is read on the phone with Vision, and any QR code is decoded. Badges use the live
/// QR scanner. The page then fills in the details from what was found.
@MainActor
final class CardScanner: NSObject, VNDocumentCameraViewControllerDelegate {
    static let shared = CardScanner()

    struct Result {
        let image: String // data: URL of the straightened card, or "" for a live QR scan
        let text: String  // the lines of text read on the phone
        let qr: String    // a QR code found on it
    }

    private var completion: ((Result?) -> Void)?

    func scan(kind: String, from presenter: UIViewController, completion: @escaping (Result?) -> Void) {
        self.completion = completion
        if kind == "badge", #available(iOS 16.0, *), DataScannerViewController.isSupported, DataScannerViewController.isAvailable {
            presentQRScanner(from: presenter)
            return
        }
        guard VNDocumentCameraViewController.isSupported else {
            Wallet.show("This device has no camera that can scan cards.", on: presenter)
            self.completion = nil
            return
        }
        let camera = VNDocumentCameraViewController()
        camera.delegate = self
        presenter.present(camera, animated: true)
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        let image = scan.pageCount > 0 ? scan.imageOfPage(at: 0) : nil
        controller.dismiss(animated: true) {
            if let image { self.read(image) } else { self.completion = nil }
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        completion = nil
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true)
        completion = nil
    }

    private func read(_ image: UIImage) {
        DispatchQueue.global(qos: .userInitiated).async {
            let small = image.scaled(maxSide: 1600)
            var lines: [String] = []
            var qr = ""
            if let cg = small.cgImage {
                let textRequest = VNRecognizeTextRequest()
                textRequest.recognitionLevel = .accurate
                textRequest.usesLanguageCorrection = true
                if #available(iOS 16.0, *) { textRequest.automaticallyDetectsLanguage = true }
                let codeRequest = VNDetectBarcodesRequest()
                codeRequest.symbologies = [.qr]
                try? VNImageRequestHandler(cgImage: cg, orientation: .up).perform([textRequest, codeRequest])
                lines = (textRequest.results ?? []).compactMap { $0.topCandidates(1).first?.string }
                qr = (codeRequest.results ?? []).compactMap(\.payloadStringValue).first ?? ""
            }
            let jpeg = small.jpegData(compressionQuality: 0.85)?.base64EncodedString() ?? ""
            DispatchQueue.main.async {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                self.completion?(Result(image: jpeg.isEmpty ? "" : "data:image/jpeg;base64,\(jpeg)", text: lines.joined(separator: "\n"), qr: qr))
                self.completion = nil
            }
        }
    }
}

@available(iOS 16.0, *)
extension CardScanner: DataScannerViewControllerDelegate {
    fileprivate func presentQRScanner(from presenter: UIViewController) {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced,
                                                recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false,
                                                isHighlightingEnabled: true)
        scanner.delegate = self
        scanner.navigationItem.title = "Scan the badge's QR code"
        let nav = UINavigationController(rootViewController: scanner)
        scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel, primaryAction: UIAction { [weak self, weak nav] _ in
            nav?.dismiss(animated: true)
            self?.completion = nil
        })
        presenter.present(nav, animated: true) { try? scanner.startScanning() }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            guard case .barcode(let code) = item, let value = code.payloadStringValue, !value.isEmpty else { continue }
            dataScanner.stopScanning()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            (dataScanner.navigationController ?? dataScanner).dismiss(animated: true) {
                self.completion?(Result(image: "", text: "", qr: value))
                self.completion = nil
            }
            return
        }
    }
}

extension UIImage {
    func scaled(maxSide: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        guard longest > maxSide else { return self }
        let ratio = maxSide / longest
        let target = CGSize(width: (size.width * ratio).rounded(), height: (size.height * ratio).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}
