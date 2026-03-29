# Code Signing Policy — RealityLauncher Client

This document outlines the code signing policy and release process for the **RealityLauncher Client** project. Our goal is to ensure the security, integrity, and transparency of every binary we distribute to our users.

## 1. Code Signing Sponsorship

Code signing for this project is generously provided by the [SignPath Foundation](https://signpath.org) under their Free Open Source Software program. The certificate used to sign our Windows binaries is issued to the **SignPath Foundation** on behalf of the RealityLauncher project.

We are grateful for their support in helping open-source projects distribute trusted software without triggering security warnings such as Windows SmartScreen.

## 2. Artifacts Signed

Only the following official release artifacts are signed:

- Windows installer (`.exe`)
- Windows portable executable (`.exe`)

Artifacts are built **directly from the source code** in this repository. No pre-built or externally modified binaries will ever be signed.

## 3. Build and Signing Process

To maintain security and prevent unauthorized signing, we use a fully automated CI/CD pipeline via **GitHub Actions**.

- All build workflows are defined in this repository and can be publicly audited under [`.github/workflows/`](.github/workflows/).
- Code signing is triggered **only** when an official release tag (e.g., `v1.0.0`) is pushed by an authorized release manager.
- Private signing keys are securely stored within **SignPath's Hardware Security Modules (HSMs)** and are never accessible to project maintainers.
- Each signed build is linked to a specific, auditable commit hash.

## 4. Security and Malware Policy

We are committed to distributing safe, trustworthy software.

- The full source code is available under the [GPL-3.0 License](LICENSE) and is open for public review at all times.
- We **strictly prohibit** the inclusion of malware, spyware, adware, cryptocurrency miners, or any form of undocumented telemetry in our releases.
- The software functions solely as a custom game launcher and does not maliciously alter, damage, or surveil user systems.
- All third-party dependencies are reviewed before inclusion and are kept up to date to address known vulnerabilities.

## 5. Signature Verification

Users can verify the authenticity of a signed binary by inspecting its digital signature:

1. Right-click the `.exe` file → **Properties** → **Digital Signatures** tab.
2. Confirm the signer name is **SignPath Foundation**.
3. Click **Details** → **View Certificate** to inspect the full certificate chain.

If the signature is missing, invalid, or issued by a different entity, **do not run the file** — it may have been tampered with. Please report it immediately using the contact information below.

## 6. Revocation Policy

In the event that a signed binary is found to contain a security vulnerability or is otherwise compromised:

- The affected release will be **immediately pulled** from GitHub Releases.
- A security advisory will be published via [GitHub Security Advisories](../../security/advisories).
- If necessary, SignPath will be notified to revoke the affected certificate.
- A patched release will be signed and published as soon as possible.

## 7. Release Managers

The following maintainer(s) have the authority to trigger official releases and approve the code signing process:

| Name | GitHub | Role |
| --- | --- | --- |
| CatLab Design | [@catlab-design](https://github.com/catlab-design) | Development Team |
| SamsVT | [@SamsVT](https://github.com/SamsVT) | Project Lead |

## 8. Contact and Reporting

If you discover a security vulnerability, encounter a suspicious binary, or have concerns regarding our signed releases, please reach out through one of the following channels:

- **Security issues (private):** [GitHub Security Advisories](../../security/advisories)
- **General issues:** [GitHub Issues](../../issues)
- **Email:** [studiotne1@gmail.com](mailto:studiotne1@gmail.com)

We take all reports seriously and will respond as quickly as possible.