# SmartVote-SV1
# SmartVote - College Election Management System 🎓🗳️

SmartVote is a modern, secure, and user-friendly college election system that incorporates **Face Recognition Authentication** to ensure transparent and tamper-proof voting.

> 💡 Built for educational institutions to digitally manage elections for student bodies with enhanced security and ease of use.

---

## 🔐 Features

- 🧑‍🎓 Role-based access: Voters, Candidates, Admins, and Super Admins.
- 📸 **Face authentication** using simulated Face API.
- 🗳️ Secure digital voting and real-time results.
- 📝 Candidate applications and admin approvals.
- 🧾 Voter registration and profile management.
- 📊 Dashboard with user stats, election management, and results.
- ⚡ Responsive, mobile-friendly UI with smooth UX.

---

## 🖼️ Demo

https://smartvoter.aniketh.info/

---

## 🔧 Tech Stack

| Tech             | Purpose                        |
|------------------|--------------------------------|
| HTML, CSS, JS    | Frontend and UI/UX             |
| `face-api.js`    | Face recognition (simulated)   |
| `localStorage`   | Client-side data persistence   |
| FontAwesome      | Icons                          |

> ✅ No backend or database needed — ideal for academic demo or prototype projects.

--
 Run Locally

You can open index.html directly in your browser OR use a local server:
# Python HTTP server (Python 3)
python -m http.server 8000

Then open http://localhost:8000 in your browser.


---

📂 File Structure

smartvote/
├── index.html           # Main application UI
├── styles.css           # Styling and responsive design
├── script.js            # Application logic (face auth, user roles, dashboard)
├── face-api.min.js      # Simulated face recognition API
├── package.json         # Project metadata
└── models/              # (Optional) FaceAPI model folder (if using real API)


---

🚀 Deployment

Deploy easily to:

[x] Netlify

[x] GitHub Pages

[x] Vercel


No backend setup required. Just upload or link the project files.


---

🔒 Authentication Flow

1. User registers with face capture.


2. Admin approves account.


3. On login, face can be used as passwordless entry.


4. Candidate applies for elections.


5. Voters cast votes, verified via face or login.




---

📦 Simulated face-api.js

This version uses a placeholder to simulate facial detection and matching logic. You can replace it with actual Face API models for production.


---

👥 Roles

Role	Permissions

Super Admin	Approve users, manage elections, view stats
Admin	Approve candidates, set election limits
Candidate	Apply for elections, view application status
Voter	Vote securely via face or credentials



---

📘 License

MIT License © 2025 [ Aniketh Malkarjun Kanshette ]


---

🙌 Acknowledgements

face-api.js

Font Awesome

UI inspiration from modern admin dashboards and design systems.


💼 Connect with Me

🌐 Portfolio: aniketh.info

🌐 Website: personal.aniketh.info

💼 LinkedIn: Aniketh Kanshette

📷 Instagram: @ANIKETH.PATIL.KANSHETTE
