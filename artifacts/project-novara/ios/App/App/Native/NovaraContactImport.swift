import UIKit
import Contacts
import ContactsUI

/// Native contact selection, backed by Apple's own contact picker.
///
/// PRIVACY POSTURE — read before changing anything here.
///
/// `CNContactPickerViewController` runs out of process. The user browses their
/// address book inside a system UI that Novara cannot see, and only the single
/// contact they tap is handed back. That means:
///
///   • Novara never reads the address book. Not a page of it, not a count.
///   • iOS therefore does not even show a contacts permission prompt for the
///     normal path — there is nothing to authorise.
///   • Exactly one contact crosses the boundary, chosen explicitly, every time.
///
/// The `CNContactStore` fallback below exists only for the rare case where the
/// picker hands back a contact with a property it did not prefetch. That path
/// asks for permission, and is the only reason `NSContactsUsageDescription`
/// exists in Info.plist.
///
/// The picked contact is *not* sent anywhere by this class. It is handed to the
/// web app, which prefills the existing Add Contact form with it; the user then
/// reviews the fields and saves through the normal POST /api/contacts flow,
/// with the existing contact limit, priority suggestion and duplicate check.
final class NovaraContactImport: NSObject {

    enum ImportError: LocalizedError {
        case accessDenied
        case unreadable

        var errorDescription: String? {
            switch self {
            case .accessDenied:
                return "Novara doesn't have permission to read that contact. You can allow access in iOS Settings, or type the details in instead."
            case .unreadable:
                return "That contact couldn't be read. Please enter the details manually."
            }
        }
    }

    private weak var presenter: UIViewController?
    private var completion: ((Result<Any, Error>) -> Void)?
    /// Keeps `self` alive for exactly as long as the picker is on screen.
    private var retainedSelf: NovaraContactImport?

    private static let requiredKeys: [CNKeyDescriptor] = [
        CNContactGivenNameKey as CNKeyDescriptor,
        CNContactFamilyNameKey as CNKeyDescriptor,
        CNContactOrganizationNameKey as CNKeyDescriptor,
        CNContactJobTitleKey as CNKeyDescriptor,
        CNContactEmailAddressesKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor,
        CNContactUrlAddressesKey as CNKeyDescriptor
    ]

    func present(from presenter: UIViewController, completion: @escaping (Result<Any, Error>) -> Void) {
        self.presenter = presenter
        self.completion = completion
        self.retainedSelf = self

        let picker = CNContactPickerViewController()
        picker.delegate = self
        // Showing every property keeps the picker recognisable as the system
        // contact list the user already knows.
        picker.displayedPropertyKeys = nil
        presenter.present(picker, animated: true)
    }

    private func finish(_ result: Result<Any, Error>) {
        let callback = completion
        completion = nil
        retainedSelf = nil
        callback?(result)
    }

    // MARK: - Mapping

    /// Maps a CNContact onto the fields Novara's Add Contact form already has.
    ///
    /// Shape matches `ScannedContact` in src/lib/businessCardParse.ts, so the
    /// web side reuses the same prefill path the card scanner uses instead of
    /// growing a second one.
    static func payload(for contact: CNContact) -> [String: Any] {
        var payload: [String: Any] = [:]

        if contact.isKeyAvailable(CNContactGivenNameKey), !contact.givenName.isEmpty {
            payload["firstName"] = contact.givenName
        }
        if contact.isKeyAvailable(CNContactFamilyNameKey), !contact.familyName.isEmpty {
            payload["lastName"] = contact.familyName
        }
        if contact.isKeyAvailable(CNContactOrganizationNameKey), !contact.organizationName.isEmpty {
            payload["company"] = contact.organizationName
        }
        if contact.isKeyAvailable(CNContactJobTitleKey), !contact.jobTitle.isEmpty {
            payload["role"] = contact.jobTitle
        }
        if contact.isKeyAvailable(CNContactEmailAddressesKey),
           let email = preferred(from: contact.emailAddresses, labels: [CNLabelWork, CNLabelHome]) {
            payload["email"] = email as String
        }
        if contact.isKeyAvailable(CNContactPhoneNumbersKey),
           let phone = preferred(from: contact.phoneNumbers, labels: [CNLabelPhoneNumberMobile, CNLabelPhoneNumberiPhone, CNLabelWork]) {
            payload["phone"] = phone.stringValue
        }
        if contact.isKeyAvailable(CNContactUrlAddressesKey),
           let linkedIn = contact.urlAddresses
            .map({ $0.value as String })
            .first(where: { $0.lowercased().contains("linkedin.com") }) {
            payload["linkedinUrl"] = linkedIn
        }

        return payload
    }

    /// Picks the value whose label appears earliest in `labels`, falling back
    /// to the first value. A work email beats a personal one for a
    /// professional network; a mobile number beats a landline.
    private static func preferred<T>(from values: [CNLabeledValue<T>], labels: [String]) -> T? {
        for label in labels {
            if let match = values.first(where: { $0.label == label }) {
                return match.value
            }
        }
        return values.first?.value
    }

    /// Re-fetches a contact when the picker handed one back without the keys we
    /// need. Needs real contacts permission, so it is the exception, not the rule.
    private func refetch(_ contact: CNContact, then handle: @escaping (Result<CNContact, Error>) -> Void) {
        let store = CNContactStore()

        let proceed = {
            do {
                let full = try store.unifiedContact(withIdentifier: contact.identifier,
                                                    keysToFetch: Self.requiredKeys)
                handle(.success(full))
            } catch {
                handle(.failure(ImportError.unreadable))
            }
        }

        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .authorized:
            proceed()
        case .notDetermined:
            store.requestAccess(for: .contacts) { granted, _ in
                DispatchQueue.main.async {
                    granted ? proceed() : handle(.failure(ImportError.accessDenied))
                }
            }
        default:
            // Denied, restricted, or limited-with-this-contact-excluded.
            handle(.failure(ImportError.accessDenied))
        }
    }
}

extension NovaraContactImport: CNContactPickerDelegate {

    func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        let hasEverything = contact.areKeysAvailable(Self.requiredKeys)

        if hasEverything {
            finish(.success(Self.payload(for: contact)))
            return
        }

        refetch(contact) { [weak self] result in
            switch result {
            case .success(let full):
                self?.finish(.success(Self.payload(for: full)))
            case .failure:
                // A partial contact still beats failing outright: whatever the
                // picker did hand back is prefilled, and the user types the rest.
                let partial = Self.payload(for: contact)
                if partial.isEmpty {
                    self?.finish(.failure(ImportError.unreadable))
                } else {
                    self?.finish(.success(partial))
                }
            }
        }
    }

    func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        // Cancelling is a normal outcome, not an error — the web side simply
        // leaves the form as it was.
        finish(.success(["cancelled": true]))
    }
}
