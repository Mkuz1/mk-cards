import CoreNFC
import UIKit

/// Writes the card's address to an NFC tag (sticker, card or key ring). Tapping the tag with any phone opens the card.
final class NFCWriter: NSObject, NFCNDEFReaderSessionDelegate {
    static let shared = NFCWriter()
    private var session: NFCNDEFReaderSession?
    private var message: NFCNDEFMessage?

    static var isAvailable: Bool { NFCNDEFReaderSession.readingAvailable }

    func write(_ url: URL) {
        guard NFCNDEFReaderSession.readingAvailable, let record = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else { return }
        message = NFCNDEFMessage(records: [record])
        session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: false)
        session?.alertMessage = "Hold the top of your iPhone near the NFC tag."
        session?.begin()
    }

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        self.session = nil
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {}

    func readerSessionDidBecomeActive(_ session: NFCNDEFReaderSession) {}

    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        guard let tag = tags.first, let message else { return }
        session.connect(to: tag) { error in
            if error != nil {
                session.invalidate(errorMessage: "Could not connect to the tag. Please try again.")
                return
            }
            tag.queryNDEFStatus { status, _, error in
                guard error == nil, status == .readWrite else {
                    session.invalidate(errorMessage: "This tag cannot be written to.")
                    return
                }
                tag.writeNDEF(message) { error in
                    if error != nil {
                        session.invalidate(errorMessage: "Writing failed. Please try again.")
                    } else {
                        session.alertMessage = "Done. Tapping this tag now opens your card."
                        session.invalidate()
                    }
                }
            }
        }
    }
}
