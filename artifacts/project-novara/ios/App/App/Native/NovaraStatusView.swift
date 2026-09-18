import UIKit

/// The full-screen native state shown while the web app has not rendered yet,
/// and when it could not be reached at all.
///
/// Before this existed, a cold launch with no network showed WKWebView's own
/// "Safari cannot open the page" sheet inside the app — the single most
/// website-like thing the shell could possibly do.
final class NovaraLaunchStateView: UIView {

    enum State {
        case loading
        case offline
        case failed
    }

    private let spinner = UIActivityIndicatorView(style: .medium)
    private let iconView = UIImageView()
    private let titleLabel = UILabel()
    private let bodyLabel = UILabel()
    private let retryButton = UIButton(type: .system)
    private let stack = UIStackView()

    /// Called when the user taps Try again.
    var onRetry: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setUp()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setUp()
    }

    private func setUp() {
        backgroundColor = NovaraTheme.background

        spinner.color = NovaraTheme.primary
        spinner.hidesWhenStopped = true

        iconView.contentMode = .scaleAspectFit
        iconView.tintColor = NovaraTheme.mutedForeground
        iconView.image = UIImage(systemName: "wifi.slash")
        iconView.setContentHuggingPriority(.required, for: .vertical)
        NSLayoutConstraint.activate([iconView.heightAnchor.constraint(equalToConstant: 44)])

        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textColor = NovaraTheme.foreground
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        bodyLabel.font = .systemFont(ofSize: 14)
        bodyLabel.textColor = NovaraTheme.mutedForeground
        bodyLabel.textAlignment = .center
        bodyLabel.numberOfLines = 0

        var configuration = UIButton.Configuration.filled()
        configuration.title = "Try again"
        configuration.baseBackgroundColor = NovaraTheme.primary
        configuration.baseForegroundColor = .white
        configuration.cornerStyle = .large
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 24, bottom: 12, trailing: 24)
        retryButton.configuration = configuration
        retryButton.addTarget(self, action: #selector(handleRetry), for: .touchUpInside)

        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        [spinner, iconView, titleLabel, bodyLabel, retryButton].forEach(stack.addArrangedSubview)
        stack.setCustomSpacing(20, after: bodyLabel)
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -32)
        ])

        apply(.loading)
    }

    func apply(_ state: State) {
        switch state {
        case .loading:
            spinner.startAnimating()
            spinner.isHidden = false
            iconView.isHidden = true
            titleLabel.isHidden = true
            bodyLabel.isHidden = true
            retryButton.isHidden = true

        case .offline:
            spinner.stopAnimating()
            iconView.isHidden = false
            iconView.image = UIImage(systemName: "wifi.slash")
            titleLabel.isHidden = false
            titleLabel.text = "You're offline"
            bodyLabel.isHidden = false
            bodyLabel.text = "Novara needs a connection to load your network. Reconnect and try again."
            retryButton.isHidden = false

        case .failed:
            spinner.stopAnimating()
            iconView.isHidden = false
            iconView.image = UIImage(systemName: "exclamationmark.triangle")
            titleLabel.isHidden = false
            titleLabel.text = "Novara didn't load"
            bodyLabel.isHidden = false
            bodyLabel.text = "Something went wrong reaching Novara. Please try again in a moment."
            retryButton.isHidden = false
        }
    }

    @objc private func handleRetry() {
        onRetry?()
    }
}

/// The thin transient bar that slides in when the connection drops *after* the
/// app has loaded. Non-blocking on purpose: everything already on screen still
/// works, only fresh data does not.
final class NovaraConnectionBanner: UIView {

    private let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setUp()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setUp()
    }

    private func setUp() {
        backgroundColor = NovaraTheme.foreground
        alpha = 0

        label.text = "No connection"
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.textColor = .white
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)

        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            label.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6)
        ])
    }

    func setVisible(_ visible: Bool) {
        UIView.animate(withDuration: 0.25) { self.alpha = visible ? 1 : 0 }
    }
}
