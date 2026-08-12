# Descope POC

Two React Native apps exploring Descope as an identity provider for a member portal. They are built on
**opposite credential models**, on purpose — each answers a different question.

| | [`MemberPortal/`](MemberPortal) | [`PilotApp/`](PilotApp) |
| --- | --- | --- |
| Question it answers | can registration run through Descope while we keep the password? | does the sign-in experience we want actually work? |
| Password stored in | the MemberPortal .NET database | **Descope** |
| Built | registration (a Descope flow calling a BFF) | **sign-in** — password, OTP, passkey, biometrics |
| Not built | sign-in (see below) | registration |
| Claims | a .NET-minted enriched token (planned) | a Descope JWT Template (working) |

MemberPortal hit a known dead end, recorded in its own architecture doc: sign-in doesn't work for
members registered through it, because the password is in our database and Descope's password sign-in
doesn't know about it. The Pilot App doesn't fix that — it sets the constraint aside to prove the
sign-in half standalone, before the .NET integration is designed.

Which credential model to carry forward is an open decision. These two apps exist to inform it.

## Where to start

| | |
| --- | --- |
| [`PilotApp/README.md`](PilotApp/README.md) | the sign-in pilot — start with its Descope setup guide |
| [`docs/architecture.md`](docs/architecture.md) | MemberPortal's architecture and the decisions behind it |
| [`PilotApp/docs/architecture.md`](PilotApp/docs/architecture.md) | the Pilot App's, and how it diverges |

Each app's docs live with it, except MemberPortal's, which are in the top-level [`docs/`](docs).
