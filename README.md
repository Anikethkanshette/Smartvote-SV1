# SmartVote — SV1

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen)](https://smartvoter.aniketh.info/) [![Built With](https://img.shields.io/badge/Built%20With-JavaScript-yellow)](https://www.javascript.com/) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Last Commit](https://img.shields.io/github/last-commit/Anikethkanshette/Smartvote-SV1)](https://github.com/Anikethkanshette/Smartvote-SV1/commits/main)

<p align="center">
  <a href="https://smartvoter.aniketh.info/">
    <img src="docs/screenshots/hero.png" alt="SmartVote hero screenshot" width="100%" style="max-width:1100px;border-radius:12px;border:1px solid rgba(0,0,0,0.06);"/>
  </a>
</p>

> Modern, secure and mobile-first college election system with face-authentication and a clean admin dashboard. Built for reliability, accessibility, and ease of use.

---

Why this README is organized
- Quick visual summary and direct demo link for reviewers
- Clear setup and deployment steps for maintainers
- Detailed documentation sections for face-auth integration, configuration, and security notes

Table of contents
- Introduction
- Live Demo
- Key Features
- Screenshots
- Quick Start (Run locally)
- Deployment (Static hosting & PWA)
- Configuration & Environment Variables
- Face Authentication — Integration Guide
- Architecture & Data Flow
- API Endpoints (reference)
- Security & Privacy Notes
- Testing & QA
- Contributing Guide
- Changelog & Releases
- License & Author

---

Introduction
SmartVote-SV1 is an opinionated reference implementation of a college/institution voting platform that prioritizes:
- Secure voter verification using face-authentication
- Mobile-first responsive UI for voters and admins
- Lightweight front-end demo with clear extension points for production backends

Live Demo
- Explore the live demo: https://smartvoter.aniketh.info/ (Super Admin view shows system metrics, approvals and candidate flows)

Key Features
- Face-authenticated voter registration and verification (configurable SDK)
- Clean Super Admin dashboard: users, active elections, pending approvals, face-registered count
- Candidate application and approvals flow
- PWA-ready front-end with install prompt for mobile users
- Simple, extensible HTML/JS/CSS codebase that can be wired to any backend

Screenshots (add high-quality images to docs/screenshots/)
- Hero banner: docs/screenshots/hero.png (recommended 1280×480)
- Dashboard: docs/screenshots/dashboard.png (recommended 1280×720)
- Face auth flow (GIF): docs/screenshots/face-auth-demo.gif

Quick Start (Run locally)
1. Clone the repository
```bash
git clone https://github.com/Anikethkanshette/Smartvote-SV1.git
cd Smartvote-SV1
```
2. Run a local static server (recommended)
```bash
# Python 3
python -m http.server 8000
# or using Node http-server (install if needed)
npm install -g http-server
http-server -p 8080
```
3. Open http://localhost:8000 (or the port you chose)

Deployment (Static hosting & PWA)
- Recommended: GitHub Pages / Netlify / Vercel. Just point the site to the repo root.
- Ensure docs/screenshots files are committed to keep README hero and dashboard showing correctly on the hosted README.

Configuration & Environment Variables
- config.js (or equivalent) should contain endpoint and SDK configuration keys. Example variables to provide in production:
  - API_BASE_URL=https://api.yourdomain.com
  - FACE_SDK_KEY=
  - PWA_NAME=SmartVote

Face Authentication — Integration Guide
This project ships with a placeholder integration. To integrate a real face-auth provider: 
1. Choose provider (examples: Face++ / AWS Rekognition / Microsoft Face API / on-device models like face-api.js).
2. Replace the face capture and matching code in src/face-auth.js (or the UI handler) with the provider SDK calls.
3. Typical flow:
   - User registers: capture photo(s) -> store face template/hash + user id (server or encrypted DB).
   - At vote time: capture live image -> match against stored template -> allow voting if confidence threshold met.
4. Security: perform matching server-side if you need to keep templates private, or use secure enclaves for on-device matching.

Architecture & Data Flow
- UI (static front-end) 
- REST API or server mock 
- Database (users, elections, votes)
- Face templates: Optionally encrypted and stored separately from PII.
- Minimal, modular front-end makes it easy to plug in real backends or mocked flows for demos.

API Endpoints (Reference)
- POST /api/register - Register user (body: { name, email, roll, faceTemplate })
- POST /api/login - Authenticate (email/roll + password or OTP)
- POST /api/face-match - Match face image to existing templates (returns match confidence)
- GET /api/elections - List elections
- POST /api/elections - Create election (admin)
- POST /api/vote - Submit vote payload

Security & Privacy Notes
- Face biometrics are highly sensitive. When enabling face-auth, follow local laws and institutional policies.
- Store face templates encrypted at rest; store PII separately and minimize linkability.
- Use HTTPS everywhere and secure your API keys (do not embed production keys in client-side code).

Testing & QA
- Manual testing checklist: registration, face registration, candidate application, admin approvals, voting flow on mobile and desktop.
- Recommended automated tests: unit tests for core JS utilities, end-to-end tests (Playwright or Cypress) for the full flow.

Contributing Guide
- Fork the repo, create a branch named feat/short-desc or fix/short-desc, open a PR to main.
- Add clear issue descriptions and link PRs to issues where applicable.
- Suggested labels: good first issue, enhancement, bug, help wanted.

Changelog & Releases
- Use semantic commits (feat/fix/chore/docs) and tag releases with vMAJOR.MINOR.PATCH. Example: v1.0.0

License & Author
- MIT License — see LICENSE file for details.
- Author: Aniketh Kanshette — https://personal.aniketh.info — https://github.com/Anikethkanshette

Support & Contact
- For questions or improvements, open an issue on GitHub or reach out via the GitHub profile.

---

Thank you for using SmartVote! If you want, I can also:
- Add the screenshot files to docs/screenshots from the live demo (if you provide images),
- Create a release and update the repo tags,
- Or open a PR instead of pushing to main if you’d prefer a review flow.
