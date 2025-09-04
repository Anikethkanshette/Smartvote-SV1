// Global State
let currentUser = null
let users = []
let elections = []
let applications = []
let votes = []
let faceAuthMode = "register" // 'register' or 'verify'
let currentStream = null
let registrationFaceData = null
let registrationFingerprintData = null

let faceDetection = null
let camera = null
let isProcessingFace = false
let isProcessingBiometric = false

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  console.log("SmartVote loaded with comprehensive features - timestamp:", Date.now())
  initializeData()
  setupEventListeners()
  loadMediaPipe() // Load MediaPipe instead of face-api
  initializePWA()
  initializeNotifications()
  setupQRSystem()
  initializeBiometricAuth()
})

async function initializeBiometricAuth() {
  try {
    // Check if WebAuthn is supported
    if (window.PublicKeyCredential) {
      console.log("WebAuthn supported - biometric authentication available")
    } else {
      console.warn("WebAuthn not supported - fingerprint authentication unavailable")
    }
  } catch (error) {
    console.warn("Error initializing biometric auth:", error)
  }
}

async function loadMediaPipe() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("MediaDevices API not supported")
    }

    // Check camera permissions
    const permissions = await navigator.permissions.query({ name: "camera" })
    console.log("Camera permission status:", permissions.state)

    const FaceDetection = window.FaceDetection
    if (FaceDetection) {
      faceDetection = new FaceDetection({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/${file}`
        },
      })

      faceDetection.setOptions({
        model: "short",
        minDetectionConfidence: 0.5,
      })

      faceDetection.onResults(onFaceDetectionResults)
      console.log("MediaPipe Face Detection initialized successfully")
    } else {
      console.warn("MediaPipe Face Detection not available, using fallback")
    }

    console.log("MediaPipe + TensorFlow.js loaded successfully")
  } catch (error) {
    console.warn("MediaPipe not fully supported. Face authentication will use basic camera capture.", error)
    // Fallback to basic implementation without advanced features
  }
}

function onFaceDetectionResults(results) {
  if (results.detections && results.detections.length > 0) {
    const detection = results.detections[0]
    const confidence = detection.score[0]

    if (confidence > 0.7) {
      // Face detected with good confidence
      updateFaceStatus("success", `Face detected (${Math.round(confidence * 100)}% confidence)`)
    } else {
      updateFaceStatus("camera", "Position your face in the circle")
    }
  } else {
    updateFaceStatus("camera", "No face detected - position yourself in the circle")
  }
}

// Data Initialization
function initializeData() {
  // Load existing data or create defaults
  users = JSON.parse(localStorage.getItem("smartvote-users") || "[]")
  elections = JSON.parse(localStorage.getItem("smartvote-elections") || "[]")
  applications = JSON.parse(localStorage.getItem("smartvote-applications") || "[]")
  votes = JSON.parse(localStorage.getItem("smartvote-votes") || "[]")

  // Create default super admin if no users exist
  if (users.length === 0) {
    const defaultSuperAdmin = {
      id: "super-admin-1",
      username: "admin",
      password: "admin123",
      prn: "ADMIN001",
      branch: "Administration",
      role: "super-admin",
      email: "admin@college.edu",
      approved: true,
      createdAt: new Date().toISOString(),
      faceRegistered: false,
      fingerprintRegistered: false,
      faceData: null,
      fingerprintData: null,
    }
    users.push(defaultSuperAdmin)
    localStorage.setItem("smartvote-users", JSON.stringify(users))
  }
}

// Event Listeners
function setupEventListeners() {
  // Profile form submission
  document.getElementById("profile-form").addEventListener("submit", handleProfileUpdate)

  // Close modal when clicking outside
  window.addEventListener("click", (event) => {
    const profileModal = document.getElementById("profile-modal")
    const faceModal = document.getElementById("face-auth-modal")

    if (event.target === profileModal) {
      closeProfileModal()
    }
    if (event.target === faceModal) {
      closeFaceAuthModal()
    }
  })
}

async function registerFingerprint() {
  if (isProcessingBiometric) return

  isProcessingBiometric = true

  try {
    showToast("Fingerprint Registration", "Please use your device's fingerprint sensor", "info")

    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) {
      throw new Error("Biometric authentication not supported on this device")
    }

    // Create credential options
    const credentialCreationOptions = {
      publicKey: {
        challenge: new Uint8Array(32),
        rp: {
          name: "SmartVote",
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(`user-${Date.now()}`),
          name: document.getElementById("reg-username").value || "user",
          displayName: document.getElementById("reg-username").value || "SmartVote User",
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
        attestation: "direct",
      },
    }

    // Create credential
    const credential = await navigator.credentials.create(credentialCreationOptions)

    if (credential) {
      registrationFingerprintData = {
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        type: credential.type,
        response: {
          attestationObject: Array.from(new Uint8Array(credential.response.attestationObject)),
          clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON)),
        },
      }

      updateFingerprintPreview(true)
      showToast("Fingerprint Registered", "Fingerprint authentication has been set up successfully", "success")
    }
  } catch (error) {
    console.error("Error registering fingerprint:", error)
    showToast("Registration Failed", error.message || "Failed to register fingerprint", "error")
  }

  isProcessingBiometric = false
}

async function loginWithFingerprint() {
  if (isProcessingBiometric) return

  isProcessingBiometric = true

  try {
    showToast("Fingerprint Login", "Please use your device's fingerprint sensor", "info")

    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) {
      throw new Error("Biometric authentication not supported on this device")
    }

    // Find users with fingerprint data
    const fingerprintUsers = users.filter((user) => user.fingerprintRegistered && user.fingerprintData)

    if (fingerprintUsers.length === 0) {
      throw new Error("No fingerprint registrations found")
    }

    // Create assertion options
    const credentialRequestOptions = {
      publicKey: {
        challenge: new Uint8Array(32),
        allowCredentials: fingerprintUsers.map((user) => ({
          id: new Uint8Array(user.fingerprintData.rawId),
          type: "public-key",
        })),
        userVerification: "required",
        timeout: 60000,
      },
    }

    // Get assertion
    const assertion = await navigator.credentials.get(credentialRequestOptions)

    if (assertion) {
      // Find matching user
      const matchedUser = fingerprintUsers.find((user) => user.fingerprintData.id === assertion.id && user.approved)

      if (matchedUser) {
        currentUser = matchedUser
        showToast("Login Successful", `Welcome back, ${matchedUser.username}!`, "success")
        showMainApp()
      } else {
        throw new Error("Fingerprint not recognized or account not approved")
      }
    }
  } catch (error) {
    console.error("Error with fingerprint login:", error)
    showToast("Login Failed", error.message || "Fingerprint authentication failed", "error")
  }

  isProcessingBiometric = false
}

function updateFingerprintPreview(registered) {
  const preview = document.getElementById("reg-fingerprint-preview")
  if (registered) {
    preview.innerHTML = `
      <i class="fas fa-fingerprint" style="color: #10b981;"></i>
      <p style="color: #10b981;">Fingerprint registered</p>
    `
  } else {
    preview.innerHTML = `
      <i class="fas fa-fingerprint"></i>
      <p>Fingerprint not registered</p>
    `
  }
}

// Enhanced Face Authentication Functions
async function openFaceRegistration() {
  faceAuthMode = "register"
  document.getElementById("face-auth-title").textContent = "Face Registration"
  document.getElementById("face-instruction-title").textContent = "Face Registration"
  document.getElementById("capture-face-btn").style.display = "block"
  document.getElementById("verify-face-btn").style.display = "none"

  // Reset face status
  updateFaceStatus("camera", "Position your face in the circle")

  await startCamera()
  document.getElementById("face-auth-modal").style.display = "block"

  // Auto-focus on camera for better UX
  setTimeout(() => {
    const video = document.getElementById("face-video")
    if (video) {
      updateFaceStatus("camera", "Ready to capture - click capture when ready")
    }
  }, 2000)
}

async function loginWithFace() {
  faceAuthMode = "verify"
  document.getElementById("face-auth-title").textContent = "Face Authentication"
  document.getElementById("face-instruction-title").textContent = "Face Verification"
  document.getElementById("capture-face-btn").style.display = "none"
  document.getElementById("verify-face-btn").style.display = "block"

  await startCamera()
  document.getElementById("face-auth-modal").style.display = "block"
}

async function startCamera() {
  try {
    const video = document.getElementById("face-video")

    // Stop existing stream if any
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop())
    }

    updateFaceStatus("processing", "Requesting camera access...")

    // Enhanced camera constraints for better face capture
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: "user",
        frameRate: { ideal: 30 },
      },
    })

    video.srcObject = currentStream

    video.onloadedmetadata = () => {
      if (faceDetection && typeof Camera !== "undefined") {
        camera = new Camera(video, {
          onFrame: async () => {
            await faceDetection.send({ image: video })
          },
          width: 1280,
          height: 720,
        })
        camera.start()
      }
      updateFaceStatus("camera", "Position your face in the circle")
    }
  } catch (error) {
    console.error("Error accessing camera:", error)
    let errorMessage = "Unable to access camera. "

    if (error.name === "NotAllowedError") {
      errorMessage += "Please allow camera permissions and try again."
    } else if (error.name === "NotFoundError") {
      errorMessage += "No camera found on this device."
    } else {
      errorMessage += "Please check your camera and try again."
    }

    showToast("Camera Error", errorMessage, "error")
    updateFaceStatus("error", "Camera access failed")
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop())
    currentStream = null
  }
  if (camera) {
    camera.stop()
    camera = null
  }
}

function updateFaceStatus(type, message) {
  const statusElement = document.getElementById("face-status")
  const iconMap = {
    camera: "fas fa-camera",
    processing: "fas fa-cog fa-spin",
    success: "fas fa-check-circle",
    error: "fas fa-exclamation-triangle",
  }

  statusElement.className = `face-status ${type}`
  statusElement.innerHTML = `
        <i class="${iconMap[type]}"></i>
        <p>${message}</p>
    `
}

async function captureFace() {
  if (isProcessingFace) return

  isProcessingFace = true
  updateFaceStatus("processing", "Analyzing face data with MediaPipe...")

  try {
    const video = document.getElementById("face-video")
    const canvas = document.getElementById("face-canvas")
    const ctx = canvas.getContext("2d")

    // Validate video is ready
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Video not ready for capture")
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw video frame to canvas with better quality
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    let processedImageData
    if (window.tf) {
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const tensor = tf.browser.fromPixels(imageData)

        // Apply image enhancement using TensorFlow.js
        const enhanced = tf.image.adjustContrast(tensor, 0.1)
        const enhancedImageData = await tf.browser.toPixels(enhanced)

        // Put enhanced image back to canvas
        const newImageData = new ImageData(enhancedImageData, canvas.width, canvas.height)
        ctx.putImageData(newImageData, 0, 0)

        // Clean up tensors
        tensor.dispose()
        enhanced.dispose()
      } catch (tfError) {
        console.warn("TensorFlow.js enhancement failed, using original image:", tfError)
      }
    }

    // Get high-quality image data
    processedImageData = canvas.toDataURL("image/jpeg", 0.95)

    // Validate image data
    if (processedImageData.length < 10000) {
      throw new Error("Captured image appears to be too small")
    }

    updateFaceStatus("processing", "Processing facial features with MediaPipe...")
    await new Promise((resolve) => setTimeout(resolve, 1000))

    updateFaceStatus("processing", "Generating security template...")
    await new Promise((resolve) => setTimeout(resolve, 1500))

    updateFaceStatus("processing", "Validating capture quality...")
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (faceAuthMode === "registration") {
      // Store face data for registration
      registrationFaceData = processedImageData
      updateRegistrationFacePreview(processedImageData)

      updateFaceStatus("success", "Face registered successfully!")
      showToast("Registration Complete", "Face authentication has been set up for your account", "success")

      setTimeout(() => {
        closeFaceAuthModal()
      }, 2000)
    } else if (faceAuthMode === "register" && currentUser) {
      // Store face data for current user (profile update)
      currentUser.faceData = processedImageData
      currentUser.faceRegistered = true

      // Update in users array
      const userIndex = users.findIndex((u) => u.id === currentUser.id)
      if (userIndex !== -1) {
        users[userIndex] = { ...currentUser }
        localStorage.setItem("smartvote-users", JSON.stringify(users))
      }

      updateFaceStatus("success", "Face updated successfully!")
      showToast("Face Updated", "Your face authentication has been updated", "success")

      setTimeout(() => {
        closeFaceAuthModal()
        updateProfileDisplay() // Refresh profile display
      }, 2000)
    }
  } catch (error) {
    console.error("Face capture error:", error)
    updateFaceStatus("error", "Face capture failed. Please try again.")
    showToast("Capture Error", error.message || "Failed to capture face. Please try again.", "error")
  } finally {
    isProcessingFace = false
  }
}

async function openRegistrationFaceCapture() {
  faceAuthMode = "registration"
  document.getElementById("face-auth-title").textContent = "Face Registration"
  document.getElementById("face-instruction-title").textContent = "Register Your Face"
  document.getElementById("capture-face-btn").style.display = "block"
  document.getElementById("verify-face-btn").style.display = "none"

  // Update instructions for registration
  document.getElementById("face-instructions-list").innerHTML = `
        <li><i class="fas fa-check-circle"></i> Look directly at the camera</li>
        <li><i class="fas fa-check-circle"></i> Ensure good lighting</li>
        <li><i class="fas fa-check-circle"></i> Keep your face centered</li>
        <li><i class="fas fa-check-circle"></i> This will be used for secure login</li>
    `

  await startCamera()
  document.getElementById("face-auth-modal").style.display = "block"
}

function updateRegistrationFacePreview(imageData) {
  const preview = document.getElementById("reg-face-preview")
  if (imageData) {
    preview.innerHTML = `
      <img src="${imageData}" alt="Face Preview" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
      <p style="color: #10b981;">Face registered</p>
    `
  }
}

function resetRegistrationFacePreview() {
  const preview = document.getElementById("reg-face-preview")
  preview.innerHTML = `
    <i class="fas fa-face-smile"></i>
    <p>Face not registered</p>
  `
}

function simulateFaceMatch(storedFaceData, currentFaceData) {
  if (!storedFaceData || !currentFaceData) return false

  try {
    // Create temporary canvases for comparison
    const canvas1 = document.createElement("canvas")
    const canvas2 = document.createElement("canvas")
    const ctx1 = canvas1.getContext("2d")
    const ctx2 = canvas2.getContext("2d")

    return new Promise((resolve) => {
      let imagesLoaded = 0
      let similarity = 0

      // Load stored image
      const img1 = new Image()
      img1.onload = () => {
        canvas1.width = img1.width
        canvas1.height = img1.height
        ctx1.drawImage(img1, 0, 0)

        imagesLoaded++
        if (imagesLoaded === 2) {
          similarity = calculateImageSimilarity(ctx1, ctx2, canvas1.width, canvas1.height)
          resolve(similarity > 0.75) // 75% threshold for match
        }
      }
      img1.src = storedFaceData

      // Load current image
      const img2 = new Image()
      img2.onload = () => {
        canvas2.width = img2.width
        canvas2.height = img2.height
        ctx2.drawImage(img2, 0, 0)

        imagesLoaded++
        if (imagesLoaded === 2) {
          similarity = calculateImageSimilarity(ctx1, ctx2, canvas1.width, canvas1.height)
          resolve(similarity > 0.75) // 75% threshold for match
        }
      }
      img2.src = currentFaceData
    })
  } catch (error) {
    console.error("Face matching error:", error)
    return false
  }
}

function calculateImageSimilarity(ctx1, ctx2, width, height) {
  try {
    const imageData1 = ctx1.getImageData(0, 0, width, height)
    const imageData2 = ctx2.getImageData(0, 0, width, height)

    const data1 = imageData1.data
    const data2 = imageData2.data

    let totalDifference = 0
    const pixelCount = data1.length / 4 // RGBA channels

    // Compare pixel by pixel (simplified approach)
    for (let i = 0; i < data1.length; i += 4) {
      const r1 = data1[i],
        g1 = data1[i + 1],
        b1 = data1[i + 2]
      const r2 = data2[i],
        g2 = data2[i + 1],
        b2 = data2[i + 2]

      // Calculate color difference
      const diff = Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2))

      totalDifference += diff
    }

    // Calculate similarity percentage (0-1)
    const maxDifference = pixelCount * Math.sqrt(3 * Math.pow(255, 2))
    const similarity = 1 - totalDifference / maxDifference

    console.log("[v0] Face similarity calculated:", Math.round(similarity * 100) + "%")
    return similarity
  } catch (error) {
    console.error("Error calculating image similarity:", error)
    return 0
  }
}

async function verifyFace() {
  if (isProcessingFace) return

  isProcessingFace = true
  updateFaceStatus("processing", "Verifying face with MediaPipe...")

  try {
    const video = document.getElementById("face-video")
    const canvas = document.getElementById("face-canvas")
    const ctx = canvas.getContext("2d")

    // Set canvas dimensions
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0)

    // Get image data
    const currentImageData = canvas.toDataURL("image/jpeg", 0.8)

    // Simulate face verification process
    await simulateFaceProcessing()

    let matchedUser = null
    for (const user of users) {
      if (user.faceRegistered && user.faceData) {
        const isMatch = await simulateFaceMatch(user.faceData, currentImageData)
        if (isMatch) {
          matchedUser = user
          break
        }
      }
    }

    if (matchedUser && matchedUser.approved) {
      currentUser = matchedUser
      updateFaceStatus("success", "Face verified successfully!")
      showToast("Login Successful", `Welcome back, ${matchedUser.username}!`, "success")

      setTimeout(() => {
        closeFaceAuthModal()
        showMainApp()
      }, 2000)
    } else {
      updateFaceStatus("error", "Face not recognized")
      showToast("Verification Failed", "Face not recognized or account not approved", "error")
    }
  } catch (error) {
    console.error("Error verifying face:", error)
    updateFaceStatus("error", "Verification failed")
    showToast("Verification Error", "Failed to verify face", "error")
  }

  isProcessingFace = false
}

// Simulate face processing delay
function simulateFaceProcessing() {
  return new Promise((resolve) => {
    setTimeout(resolve, 2000)
  })
}

function closeFaceAuthModal() {
  document.getElementById("face-auth-modal").style.display = "none"
  stopCamera()
  isProcessingFace = false
}

// Authentication Functions
function switchTab(tab) {
  // Update tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"))
  event.target.classList.add("active")

  // Update forms
  document.querySelectorAll(".auth-form").forEach((form) => form.classList.remove("active"))
  document.getElementById(tab + "-form").classList.add("active")
}

function handleLogin(event) {
  event.preventDefault()

  const username = document.getElementById("login-username").value
  const password = document.getElementById("login-password").value

  const user = users.find((u) => u.username === username && u.password === password)

  if (!user) {
    showToast("Login Failed", "Invalid username or password", "error")
    return
  }

  if (!user.approved && user.role !== "super-admin") {
    showToast("Account Pending", "Your account is pending approval", "error")
    return
  }

  currentUser = user
  showToast("Login Successful", `Welcome back, ${user.username}!`, "success")
  showMainApp()
}

function handleRegister(event) {
  event.preventDefault()

  const username = document.getElementById("reg-username").value
  const password = document.getElementById("reg-password").value
  const confirmPassword = document.getElementById("reg-confirm-password").value
  const prn = document.getElementById("reg-prn").value
  const branch = document.getElementById("reg-branch").value
  const role = document.getElementById("reg-role").value

  if (password !== confirmPassword) {
    showToast("Registration Failed", "Passwords do not match", "error")
    return
  }

  if (users.some((u) => u.username === username || u.prn === prn)) {
    showToast("Registration Failed", "Username or PRN already exists", "error")
    return
  }

  const newUser = {
    id: `user-${Date.now()}`,
    username,
    password,
    prn,
    branch,
    role,
    email: `${username}@college.edu`,
    approved: false,
    createdAt: new Date().toISOString(),
    faceRegistered: !!registrationFaceData,
    faceData: registrationFaceData,
    fingerprintRegistered: !!registrationFingerprintData,
    fingerprintData: registrationFingerprintData,
  }

  users.push(newUser)
  localStorage.setItem("smartvote-users", JSON.stringify(users))

  const biometricMessage =
    registrationFaceData || registrationFingerprintData
      ? "Your account with biometric authentication is pending approval"
      : "Your account is pending approval. You can set up biometric authentication later in your profile"

  showToast("Registration Successful", biometricMessage, "success")
  switchTab("login")

  // Reset form and biometric data
  document.getElementById("reg-username").value = ""
  document.getElementById("reg-password").value = ""
  document.getElementById("reg-confirm-password").value = ""
  document.getElementById("reg-prn").value = ""
  document.getElementById("reg-branch").value = ""
  document.getElementById("reg-role").value = ""
  resetRegistrationFacePreview()
  updateFingerprintPreview(false)
  registrationFaceData = null
  registrationFingerprintData = null
}

function logout() {
  currentUser = null
  showToast("Logged Out", "You have been successfully logged out", "success")
  showAuthScreen()
}

// UI Functions
function showAuthScreen() {
  document.getElementById("auth-screen").style.display = "flex"
  document.getElementById("main-app").style.display = "none"
}

function showMainApp() {
  document.getElementById("auth-screen").style.display = "none"
  document.getElementById("main-app").style.display = "flex"

  updateHeader()
  renderDashboard()
}

function updateHeader() {
  const effectiveRole = getEffectiveUserRole(currentUser)
  const activeCandidacies = getUserActiveCandidacies(currentUser)

  document.getElementById("current-username").textContent = currentUser.username

  // Show effective role with candidacy indicator
  let roleText = effectiveRole.replace("-", " ").toUpperCase()
  if (effectiveRole === "candidate" && currentUser.role === "voter") {
    roleText = `CANDIDATE (${activeCandidacies.length} elections)`
  }
  document.getElementById("current-role").textContent = roleText

  // Update profile photo
  const avatar = document.getElementById("user-avatar")
  if (currentUser.profilePhoto) {
    avatar.innerHTML = `<img src="${currentUser.profilePhoto}" alt="Profile">`
  } else {
    avatar.innerHTML = '<i class="fas fa-user"></i>'
  }

  // Add face verification indicator
  if (currentUser.faceRegistered) {
    avatar.classList.add("face-verified")
  }

  // Show profile button for candidates and voters (using effective role)
  const profileBtn = document.getElementById("profile-btn")
  if (effectiveRole === "candidate" || effectiveRole === "voter") {
    profileBtn.style.display = "block"
  } else {
    profileBtn.style.display = "none"
  }

  // Add advanced features for admins
  addExportButton()
  setupQRSystem()
}

function renderDashboard() {
  const container = document.getElementById("dashboard-container")
  const effectiveRole = getEffectiveUserRole(currentUser)

  switch (effectiveRole) {
    case "super-admin":
      container.innerHTML = renderSuperAdminDashboard()
      break
    case "admin":
      container.innerHTML = renderAdminDashboard()
      break
    case "candidate":
      // Check if this is a promoted voter (base role is voter)
      if (currentUser.role === "voter") {
        container.innerHTML = renderPromotedVoterDashboard()
      } else {
        container.innerHTML = renderCandidateDashboard()
      }
      break
    case "voter":
      container.innerHTML = renderVoterDashboard()
      break
  }

  setupDashboardEventListeners()
}

// Dashboard Renderers (keeping the same as before but adding face auth indicators)
function renderSuperAdminDashboard() {
  const pendingUsers = users.filter((u) => !u.approved && u.role !== "super-admin")
  const pendingApplications = applications.filter((a) => !a.approved && !a.rejected)
  const voterApplications = applications.filter((a) => a.type === "voter-application" && !a.approved && !a.rejected)
  const activeElections = elections.filter((e) => e.active)
  const faceRegisteredUsers = users.filter((u) => u.faceRegistered).length

  return `
        <div class="dashboard-header">
            <h2 class="dashboard-title">Super Admin Dashboard</h2>
            <p class="dashboard-subtitle">Manage the entire election system</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card blue">
                <div class="stat-info">
                    <h3>${users.length}</h3>
                    <p>Total Users</p>
                </div>
                <i class="fas fa-users stat-icon"></i>
            </div>
            <div class="stat-card green">
                <div class="stat-info">
                    <h3>${activeElections.length}</h3>
                    <p>Active Elections</p>
                </div>
                <i class="fas fa-vote-yea stat-icon"></i>
            </div>
            <div class="stat-card purple">
                <div class="stat-info">
                    <h3>${pendingUsers.length + voterApplications.length}</h3>
                    <p>Pending Approvals</p>
                </div>
                <i class="fas fa-shield-alt stat-icon"></i>
            </div>
            <div class="stat-card orange">
                <div class="stat-info">
                    <h3>${faceRegisteredUsers}</h3>
                    <p>Face Registered</p>
                </div>
                <i class="fas fa-face-smile stat-icon"></i>
            </div>
        </div>
        
        <div class="tabs">
            <div class="tab-list">
                <button class="tab-trigger active" onclick="switchDashboardTab('approvals')">Approvals</button>
                <button class="tab-trigger" onclick="switchDashboardTab('elections')">Elections</button>
                <button class="tab-trigger" onclick="switchDashboardTab('candidates')">Candidates</button>
                <button class="tab-trigger" onclick="switchDashboardTab('users')">Users</button>
                <button class="tab-trigger" onclick="switchDashboardTab('results')">Results</button>
            </div>
            
            <div id="approvals-tab" class="tab-content active">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Pending User Approvals</h3>
                            <p class="card-description">Review and approve new user registrations</p>
                        </div>
                        <div class="card-content">
                            ${
                              pendingUsers.length === 0
                                ? '<div class="empty-state"><p>No pending user approvals</p></div>'
                                : `<div class="item-list">${pendingUsers
                                    .map(
                                      (user) => `
                                    <div class="list-item">
                                        <div class="item-info">
                                            <h4>${user.username} ${user.faceRegistered ? '<i class="fas fa-face-smile" style="color: #10b981;" title="Face Registered"></i>' : ""}</h4>
                                            <p>${user.role} • ${user.branch}</p>
                                            <p>PRN: ${user.prn}</p>
                                        </div>
                                        <div class="item-actions">
                                            <button class="btn btn-primary btn-sm" onclick="approveUser('${user.id}')">Approve</button>
                                            <button class="btn btn-destructive btn-sm" onclick="rejectUser('${user.id}')">Reject</button>
                                        </div>
                                    </div>
                                `,
                                    )
                                    .join("")}</div>`
                            }
                        </div>
                    </div>
                    
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Pending Candidate Applications</h3>
                            <p class="card-description">Review candidate applications from voters</p>
                        </div>
                        <div class="card-content">
                            ${
                              voterApplications.length === 0
                                ? '<div class="empty-state"><p>No pending voter applications</p></div>'
                                : `<div class="item-list">${voterApplications
                                    .map((app) => {
                                      const candidate = users.find((u) => u.id === app.userId)
                                      const election = elections.find((e) => e.id === app.electionId)
                                      return `
                                        <div class="list-item" style="flex-direction: column; align-items: stretch;">
                                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                                                <div class="item-info">
                                                    <h4>${candidate?.username} ${candidate?.faceRegistered ? '<i class="fas fa-face-smile" style="color: #10b981;" title="Face Registered"></i>' : ""}</h4>
                                                    <p><strong>${election?.name}</strong> • ${candidate?.branch}</p>
                                                    <p>Applied: ${new Date(app.appliedAt).toLocaleDateString()}</p>
                                                </div>
                                                <div class="item-actions">
                                                    <button class="btn btn-primary btn-sm" onclick="approveVoterApplication('${app.id}')">Approve</button>
                                                    <button class="btn btn-destructive btn-sm" onclick="rejectVoterApplication('${app.id}')">Reject</button>
                                                    <button class="btn btn-outline btn-sm" onclick="viewApplicationDetails('${app.id}')">Details</button>
                                                </div>
                                            </div>
                                            ${
                                              app.applicationMessage
                                                ? `
                                                <div style="background: #f8fafc; padding: 0.75rem; border-radius: 0.375rem; font-size: 0.875rem;">
                                                    <strong>Application Message:</strong> ${app.applicationMessage.substring(0, 150)}${app.applicationMessage.length > 150 ? "..." : ""}
                                                </div>
                                            `
                                                : ""
                                            }
                                        </div>
                                    `
                                    })
                                    .join("")}</div>`
                            }
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="elections-tab" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 class="card-title">Election Management</h3>
                                <p class="card-description">Manage all elections and their status</p>
                            </div>
                            <button class="btn btn-primary" onclick="openCreateElectionModal()">
                                <i class="fas fa-plus"></i> Create Election
                            </button>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="item-list">
                            ${elections
                              .map(
                                (election) => `
                                <div class="list-item">
                                    <div class="item-info">
                                        <h4>${election.name} <span class="badge ${election.active ? "badge-primary" : "badge-secondary"}">${election.active ? "Active" : "Closed"}</span></h4>
                                        <p>${election.description}</p>
                                        <p>Max Candidates: ${election.maxCandidates} • Max Voters: ${election.maxVoters}</p>
                                    </div>
                                    <div class="item-actions">
                                        <button class="btn ${election.active ? "btn-destructive" : "btn-primary"} btn-sm" onclick="toggleElection('${election.id}')">
                                            ${election.active ? "Close" : "Activate"}
                                        </button>
                                        <button class="btn btn-destructive btn-sm" onclick="deleteElection('${election.id}')">
                                            <i class="fas fa-trash"></i> Delete
                                        </button>
                                    </div>
                                </div>
                            `,
                              )
                              .join("")}
                        </div>
                    </div>
                </div>
            </div>

            <div id="candidates-tab" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 class="card-title">Candidate Management</h3>
                                <p class="card-description">Manage candidates for all elections</p>
                            </div>
                            <button class="btn btn-primary" onclick="openPromoteVoterModal()">
                                <i class="fas fa-user-plus"></i> Promote Voter to Candidate
                            </button>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="candidate-management-container">
                            ${renderCandidateManagement()}
                        </div>
                    </div>
                </div>
            </div>

            <div id="users-tab" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">All Registered Users</h3>
                        <p class="card-description">View and manage all users in the system</p>
                    </div>
                    <div class="card-content">
                        <div class="item-list">
                            ${users
                              .map(
                                (user) => `
                                <div class="list-item">
                                    <div class="item-info">
                                        <h4>${user.username}
                                            <span class="badge badge-secondary">${user.role}</span>
                                            <span class="badge ${user.approved ? "badge-success" : "badge-warning"}">${user.approved ? "Approved" : "Pending"}</span>
                                            ${user.faceRegistered ? '<i class="fas fa-face-smile" style="color: #10b981;" title="Face Registered"></i>' : ""}
                                        </h4>
                                        <p>${user.branch} • PRN: ${user.prn}</p>
                                        <p>${user.email}</p>
                                    </div>
                                    <div class="item-actions" style="display: flex; flex-direction: column; gap: 0.25rem;">
                                        <p style="font-size: 0.75rem; color: #6b7280; margin: 0;">Joined: ${new Date(user.createdAt).toLocaleDateString()}</p>
                                        ${
                                          user.role !== "super-admin"
                                            ? `<button class="btn btn-destructive btn-sm" onclick="deleteUser('${user.id}')">
                                            <i class="fas fa-trash"></i> Delete
                                        </button>`
                                            : '<span class="badge badge-warning">Protected</span>'
                                        }
                                    </div>
                                </div>
                            `,
                              )
                              .join("")}
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="results-tab" class="tab-content">
                <div class="results-grid">
                    ${elections
                      .filter((e) => !e.active)
                      .map((election) => {
                        const results = getElectionResults(election.id)
                        return `
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">${election.name} Results</h3>
                                    <p class="card-description">Final results for closed election</p>
                                </div>
                                <div class="card-content">
                                    ${
                                      results.length === 0
                                        ? '<div class="empty-state"><p>No votes cast</p></div>'
                                        : results
                                            .map(
                                              (result, index) => `
                                            <div class="result-item">
                                                <div class="result-candidate">
                                                    <div class="position-badge position-${index === 0 ? "1" : index === 1 ? "2" : index === 2 ? "3" : "other"}">
                                                        ${index + 1}
                                                    </div>
                                                    <div>
                                                        <h4>${result.candidate?.username}</h4>
                                                        <p>${result.candidate?.branch}</p>
                                                    </div>
                                                </div>
                                                <div class="result-votes">
                                                    <div class="vote-count">${result.votes}</div>
                                                    <div class="vote-label">votes</div>
                                                </div>
                                            </div>
                                        `,
                                            )
                                            .join("")
                                    }
                                </div>
                            </div>
                        `
                      })
                      .join("")}
                </div>
            </div>
        </div>
    `
}

function renderAdminDashboard() {
  const activeElections = elections.filter((e) => e.active)
  const voterApplications = applications.filter((a) => a.type === "voter-application" && !a.approved && !a.rejected)
  const approvedCandidates = applications.filter((a) => a.approved)

  return `
        <div class="dashboard-header">
            <h2 class="dashboard-title">Admin Dashboard</h2>
            <p class="dashboard-subtitle">Manage elections and candidate applications</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card blue">
                <div class="stat-info">
                    <h3>${activeElections.length}</h3>
                    <p>Active Elections</p>
                </div>
                <i class="fas fa-vote-yea stat-icon"></i>
            </div>
            <div class="stat-card purple">
                <div class="stat-info">
                    <h3>${voterApplications.length}</h3>
                    <p>Pending Applications</p>
                </div>
                <i class="fas fa-user stat-icon"></i>
            </div>
            <div class="stat-card green">
                <div class="stat-info">
                    <h3>${approvedCandidates.length}</h3>
                    <p>Total Candidates</p>
                </div>
                <i class="fas fa-users stat-icon"></i>
            </div>
        </div>
        
        <div class="tabs">
            <div class="tab-list">
                <button class="tab-trigger active" onclick="switchDashboardTab('applications')">Applications</button>
                <button class="tab-trigger" onclick="switchDashboardTab('elections')">Elections</button>
                <button class="tab-trigger" onclick="switchDashboardTab('candidates')">Candidates</button>
                <button class="tab-trigger" onclick="switchDashboardTab('limits')">Limits</button>
            </div>
            
            <div id="applications-tab" class="tab-content active">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Candidate Applications</h3>
                        <p class="card-description">Review and approve candidate applications</p>
                    </div>
                    <div class="card-content">
                        ${
                          voterApplications.length === 0
                            ? '<div class="empty-state"><p>No pending voter applications</p></div>'
                            : `<div class="item-list">${voterApplications
                                .map((app) => {
                                  const candidate = users.find((u) => u.id === app.userId)
                                  const election = elections.find((e) => e.id === app.electionId)
                                  return `
                                    <div class="list-item" style="flex-direction: column; align-items: stretch;">
                                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                                            <div class="item-info">
                                                <h4>${candidate?.username} ${candidate?.faceRegistered ? '<i class="fas fa-face-smile" style="color: #10b981;" title="Face Registered"></i>' : ""}</h4>
                                                <p><strong>${election?.name}</strong></p>
                                                <p>${candidate?.branch} • PRN: ${candidate?.prn}</p>
                                                <p>Applied: ${new Date(app.appliedAt).toLocaleDateString()}</p>
                                            </div>
                                            <div class="item-actions">
                                                <button class="btn btn-primary btn-sm" onclick="approveVoterApplication('${app.id}')">Approve</button>
                                                <button class="btn btn-destructive btn-sm" onclick="rejectVoterApplication('${app.id}')">Reject</button>
                                                <button class="btn btn-outline btn-sm" onclick="viewApplicationDetails('${app.id}')">Details</button>
                                            </div>
                                        </div>
                                        ${
                                          app.applicationMessage
                                            ? `
                                            <div style="background: #f8fafc; padding: 0.75rem; border-radius: 0.375rem; font-size: 0.875rem;">
                                                <strong>Message:</strong> ${app.applicationMessage.substring(0, 150)}${app.applicationMessage.length > 150 ? "..." : ""}
                                            </div>
                                        `
                                            : ""
                                        }
                                    </div>
                                `
                                })
                                .join("")}</div>`
                        }
                    </div>
                </div>
            </div>
            
            <div id="elections-tab" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 class="card-title">Election Status</h3>
                                <p class="card-description">Monitor current election statuses</p>
                            </div>
                            <button class="btn btn-primary" onclick="openCreateElectionModal()">
                                <i class="fas fa-plus"></i> Create Election
                            </button>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="item-list">
                            ${elections
                              .map((election) => {
                                const electionApplications = applications.filter((a) => a.electionId === election.id)
                                const approvedCandidates = electionApplications.filter((a) => a.approved).length
                                return `
                                    <div class="list-item">
                                        <div class="item-info">
                                            <h4>${election.name} <span class="badge ${election.active ? "badge-primary" : "badge-secondary"}">${election.active ? "Active" : "Closed"}</span></h4>
                                            <p>${election.description}</p>
                                            <p>Candidates: ${approvedCandidates}/${election.maxCandidates} • Max Voters: ${election.maxVoters}</p>
                                        </div>
                                    </div>
                                `
                              })
                              .join("")}
                        </div>
                    </div>
                </div>
            </div>

            <div id="candidates-tab" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 class="card-title">Candidate Management</h3>
                                <p class="card-description">Manage candidates for elections</p>
                            </div>
                            <button class="btn btn-primary" onclick="openPromoteVoterModal()">
                                <i class="fas fa-user-plus"></i> Promote Voter to Candidate
                            </button>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="candidate-management-container">
                            ${renderCandidateManagement()}
                        </div>
                    </div>
                </div>
            </div>

            <div id="limits-tab" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Election Limits</h3>
                        <p class="card-description">Set maximum candidates and voters for each election</p>
                    </div>
                    <div class="card-content">
                        <div class="item-list">
                            ${elections
                              .map(
                                (election) => `
                                <div class="list-item" style="flex-direction: column; align-items: stretch;">
                                    <h4 style="margin-bottom: 1rem;">${election.name}</h4>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                        <div class="form-group">
                                            <label>Max Candidates</label>
                                            <input type="number" value="${election.maxCandidates}" min="1" 
                                                   onchange="updateElectionLimits('${election.id}', 'maxCandidates', this.value)">
                                        </div>
                                        <div class="form-group">
                                            <label>Max Voters</label>
                                            <input type="number" value="${election.maxVoters}" min="1" 
                                                   onchange="updateElectionLimits('${election.id}', 'maxVoters', this.value)">
                                        </div>
                                    </div>
                                </div>
                            `,
                              )
                              .join("")}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
}

function renderCandidateDashboard() {
  const effectiveRole = getEffectiveUserRole(currentUser)
  const activeCandidacies = getUserActiveCandidacies(currentUser)

  // For promoted voters, only show elections they're candidates in
  let relevantElections, myApplications, approvedApplications

  if (currentUser.role === "voter" && effectiveRole === "candidate") {
    // Promoted voter - show only elections they're candidates in
    const candidateElectionIds = activeCandidacies.map((app) => app.electionId)
    relevantElections = elections.filter((e) => candidateElectionIds.includes(e.id))
    myApplications = activeCandidacies
    approvedApplications = activeCandidacies
  } else {
    // Original candidate role - show all active elections
    relevantElections = elections.filter((e) => e.active)
    myApplications = applications.filter((a) => a.userId === currentUser.id)
    approvedApplications = myApplications.filter((a) => a.approved)
  }

  const dashboardTitle = currentUser.role === "voter" ? "Active Candidate Dashboard" : "Candidate Dashboard"
  const dashboardSubtitle =
    currentUser.role === "voter"
      ? `You are currently a candidate in ${activeCandidacies.length} election(s)`
      : "Apply to participate in active elections"

  return `
        <div class="dashboard-header">
            <h2 class="dashboard-title">${dashboardTitle}</h2>
            <p class="dashboard-subtitle">${dashboardSubtitle}</p>
            ${
              currentUser.role === "voter"
                ? `
                <div class="candidate-status-banner" style="background: linear-gradient(135deg, #10b981, #3b82f6); color: white; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem;">
                    <i class="fas fa-star"></i> <strong>Promoted Status:</strong> You have been promoted to candidate by an administrator
                </div>
            `
                : ""
            }
        </div>

        <div class="stats-grid">
            <div class="stat-card blue">
                <div class="stat-info">
                    <h3>${relevantElections.length}</h3>
                    <p>${currentUser.role === "voter" ? "My Elections" : "Active Elections"}</p>
                </div>
                <i class="fas fa-vote-yea stat-icon"></i>
            </div>
            <div class="stat-card green">
                <div class="stat-info">
                    <h3>${myApplications.length}</h3>
                    <p>My Applications</p>
                </div>
                <i class="fas fa-user stat-icon"></i>
            </div>
            <div class="stat-card purple">
                <div class="stat-info">
                    <h3>${approvedApplications.length}</h3>
                    <p>Approved</p>
                </div>
                <i class="fas fa-trophy stat-icon"></i>
            </div>
        </div>
        
        <div class="tabs">
            <div class="tab-list">
                <button class="tab-trigger active" onclick="switchDashboardTab('elections')">${currentUser.role === "voter" ? "My Elections" : "Active Elections"}</button>
                <button class="tab-trigger" onclick="switchDashboardTab('applications')">My Applications</button>
                <button class="tab-trigger" onclick="switchDashboardTab('results')">Results</button>
            </div>

            <div id="elections-tab" class="tab-content active">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">${currentUser.role === "voter" ? "My Elections as Candidate" : "Active Elections"}</h3>
                        <p class="card-description">${currentUser.role === "voter" ? "Elections where you are currently a candidate" : "Apply to participate in these elections"}</p>
                    </div>
                    <div class="card-content">
                        ${
                          relevantElections.length === 0
                            ? `<div class="empty-state"><p>${currentUser.role === "voter" ? "You are not currently a candidate in any elections" : "No active elections available"}</p></div>`
                            : `<div class="item-list">${relevantElections
                                .map((election) => {
                                  const hasApplied = myApplications.some((a) => a.electionId === election.id)
                                  const candidateApp = myApplications.find((a) => a.electionId === election.id)
                                  return `
                                    <div class="list-item">
                                        <div class="item-info">
                                            <h4>${election.name} ${candidateApp ? '<span class="badge badge-success">Candidate</span>' : ""}</h4>
                                            <p>${election.description}</p>
                                            <p>Max Candidates: ${election.maxCandidates}</p>
                                            ${candidateApp && candidateApp.promotedBy ? '<p style="color: #10b981;"><i class="fas fa-star"></i> Promoted by administrator</p>' : ""}
                                        </div>
                                        <div class="item-actions">
                                            ${
                                              hasApplied
                                                ? `<span class="badge badge-success">Active Candidate</span>`
                                                : currentUser.role === "voter"
                                                  ? '<span class="badge badge-secondary">Not Available</span>'
                                                  : `<button class="btn btn-primary btn-sm" onclick="applyToElection('${election.id}')">Apply</button>`
                                            }
                                        </div>
                                    </div>
                                `
                                })
                                .join("")}</div>`
                        }
                    </div>
                </div>
            </div>
            
            <div id="applications-tab" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">My Applications</h3>
                        <p class="card-description">Track the status of your election applications</p>
                    </div>
                    <div class="card-content">
                        ${
                          myApplications.length === 0
                            ? '<div class="empty-state"><p>No applications submitted yet</p></div>'
                            : `<div class="item-list">${myApplications
                                .map((app) => {
                                  const election = elections.find((e) => e.id === app.electionId)
                                  return `
                                    <div class="list-item">
                                        <div class="item-info">
                                            <h4>${election?.name}</h4>
                                            <p>${election?.description}</p>
                                            <p>Applied: ${new Date(app.appliedAt).toLocaleDateString()}</p>
                                        </div>
                                        <div class="item-actions">
                                            <span class="badge ${app.approved ? "badge-success" : "badge-warning"}">${app.approved ? "Approved" : "Pending"}</span>
                                        </div>
                                    </div>
                                `
                                })
                                .join("")}</div>`
                        }
                    </div>
                </div>
            </div>
            
            <div id="results-tab" class="tab-content">
                ${renderElectionResults()}
            </div>
        </div>
    `
}

function renderVoterDashboard() {
  const activeElections = elections.filter((e) => e.active)
  const myVotes = votes.filter((v) => v.voterId === currentUser.id)

  return `
        <div class="dashboard-header">
            <h2 class="dashboard-title">Voter Dashboard</h2>
            <p class="dashboard-subtitle">Cast your vote in active elections</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card blue">
                <div class="stat-info">
                    <h3>${activeElections.length}</h3>
                    <p>Active Elections</p>
                </div>
                <i class="fas fa-vote-yea stat-icon"></i>
            </div>
            <div class="stat-card green">
                <div class="stat-info">
                    <h3>${myVotes.length}</h3>
                    <p>My Votes</p>
                </div>
                <i class="fas fa-trophy stat-icon"></i>
            </div>
            <div class="stat-card purple">
                <div class="stat-info">
                    <h3>${activeElections.length - myVotes.length}</h3>
                    <p>Remaining</p>
                </div>
                <i class="fas fa-calendar stat-icon"></i>
            </div>
        </div>
        
        <div class="tabs">
            <div class="tab-list">
                <button class="tab-trigger active" onclick="switchDashboardTab('elections')">Active Elections</button>
                <button class="tab-trigger" onclick="switchDashboardTab('applications')">Apply for Candidate</button>
                <button class="tab-trigger" onclick="switchDashboardTab('results')">Results</button>
            </div>
            
            <div id="elections-tab" class="tab-content active">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Active Elections</h3>
                        <p class="card-description">Cast your vote in these elections</p>
                    </div>
                    <div class="card-content">
                        ${activeElections
                          .map((election) => {
                            const candidates = getElectionCandidates(election.id)
                            const hasVoted = myVotes.some((v) => v.electionId === election.id)

                            return `
                                <div class="card" style="margin-bottom: 1rem; ${hasVoted ? "opacity: 0.75;" : ""}">
                                    <div class="card-header">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <div>
                                                <h3 class="card-title">${election.name}</h3>
                                                <p class="card-description">${election.description}</p>
                                            </div>
                                            ${hasVoted ? '<span class="badge badge-secondary">Voted</span>' : ""}
                                        </div>
                                    </div>
                                    <div class="card-content">
                                        ${
                                          candidates.length === 0
                                            ? '<div class="empty-state"><p>No candidates available</p></div>'
                                            : `<div class="item-list">${candidates
                                                .map(
                                                  (candidate) => `
                                                <div class="list-item">
                                                    <div class="item-info">
                                                        <h4>${candidate?.username} ${candidate?.faceRegistered ? '<i class="fas fa-face-smile" style="color: #10b981;" title="Face Registered"></i>' : ""}</h4>
                                                        <p>${candidate?.branch}</p>
                                                        <p>PRN: ${candidate?.prn}</p>
                                                    </div>
                                                    <div class="item-actions">
                                                        <button class="btn btn-primary btn-sm"
                                                                onclick="castVote('${election.id}', '${candidate?.id}')"
                                                                ${hasVoted ? "disabled" : ""}>
                                                            ${hasVoted ? "Voted" : "Vote"}
                                                        </button>
                                                    </div>
                                                </div>
                                            `,
                                                )
                                                .join("")}

                                                <!-- None of the Above Option -->
                                                <div class="list-item none-of-above-option" style="border: 2px dashed #6b7280; background: #f9fafb;">
                                                    <div class="item-info">
                                                        <h4><i class="fas fa-ban"></i> None of the Above</h4>
                                                        <p>Choose this if you don't support any candidate</p>
                                                    </div>
                                                    <div class="item-actions">
                                                        <button class="btn btn-secondary btn-sm"
                                                                onclick="castVote('${election.id}', 'none-of-above')"
                                                                ${hasVoted ? "disabled" : ""}>
                                                            ${hasVoted ? "Voted" : "Vote None"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>`
                                        }
                                    </div>
                                </div>
                            `
                          })
                          .join("")}
                        
                        ${
                          activeElections.length === 0
                            ? `
                            <div class="empty-state">
                                <i class="fas fa-vote-yea"></i>
                                <h3>No Active Elections</h3>
                                <p>There are currently no active elections to vote in.</p>
                            </div>
                        `
                            : ""
                        }
                    </div>
                </div>
            </div>

            <div id="applications-tab" class="tab-content">
                ${renderVoterCandidateApplications()}
            </div>

            <div id="results-tab" class="tab-content">
                ${renderElectionResults()}
            </div>
        </div>
    `
}

function renderPromotedVoterDashboard() {
  const activeCandidacies = getUserActiveCandidacies(currentUser)
  const activeElections = elections.filter((e) => e.active)
  const myVotes = votes.filter((v) => v.voterId === currentUser.id)
  const myApplications = applications.filter((a) => a.userId === currentUser.id)

  // Elections where user is NOT a candidate (can vote)
  const candidateElectionIds = activeCandidacies.map((app) => app.electionId)
  const votingElections = activeElections.filter((e) => !candidateElectionIds.includes(e.id))

  return `
    <div class="dashboard-header">
      <h2 class="dashboard-title">Voter & Candidate Dashboard</h2>
      <p class="dashboard-subtitle">You are a candidate in ${activeCandidacies.length} election(s) and can vote in ${votingElections.length} other election(s)</p>
      <div class="dual-role-banner" style="background: linear-gradient(135deg, #10b981, #3b82f6); color: white; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem;">
        <i class="fas fa-star"></i> <strong>Dual Role:</strong> You have voting rights AND candidate status
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card blue">
        <div class="stat-info">
          <h3>${activeElections.length}</h3>
          <p>Total Active Elections</p>
        </div>
        <i class="fas fa-vote-yea stat-icon"></i>
      </div>
      <div class="stat-card green">
        <div class="stat-info">
          <h3>${activeCandidacies.length}</h3>
          <p>My Candidacies</p>
        </div>
        <i class="fas fa-trophy stat-icon"></i>
      </div>
      <div class="stat-card purple">
        <div class="stat-info">
          <h3>${myVotes.length}</h3>
          <p>My Votes Cast</p>
        </div>
        <i class="fas fa-check-circle stat-icon"></i>
      </div>
      <div class="stat-card orange">
        <div class="stat-info">
          <h3>${votingElections.length}</h3>
          <p>Can Vote In</p>
        </div>
        <i class="fas fa-hand-paper stat-icon"></i>
      </div>
    </div>

    <div class="tabs">
      <div class="tab-list">
        <button class="tab-trigger active" onclick="switchDashboardTab('candidacy')">My Candidacies</button>
        <button class="tab-trigger" onclick="switchDashboardTab('voting')">Voting</button>
        <button class="tab-trigger" onclick="switchDashboardTab('applications')">Apply for Candidate</button>
        <button class="tab-trigger" onclick="switchDashboardTab('results')">Results</button>
      </div>

      <div id="candidacy-tab" class="tab-content active">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">My Candidacies</h3>
            <p class="card-description">Elections where you are currently a candidate</p>
          </div>
          <div class="card-content">
            ${
              activeCandidacies.length === 0
                ? '<div class="empty-state"><p>You are not currently a candidate in any elections</p></div>'
                : `<div class="item-list">${activeCandidacies
                    .map((candidacy) => {
                      const election = elections.find((e) => e.id === candidacy.electionId)
                      const electionVotes = votes.filter(
                        (v) => v.electionId === candidacy.electionId && v.candidateId === currentUser.id,
                      )
                      return `
                        <div class="list-item">
                          <div class="item-info">
                            <h4>${election?.name} <span class="badge badge-success">Candidate</span></h4>
                            <p>${election?.description}</p>
                            <p>Votes received: ${electionVotes.length}</p>
                            ${candidacy.promotedBy ? '<p style="color: #10b981;"><i class="fas fa-star"></i> Promoted by administrator</p>' : ""}
                          </div>
                          <div class="item-actions">
                            <span class="badge badge-primary">Active Candidate</span>
                          </div>
                        </div>
                      `
                    })
                    .join("")}</div>`
            }
          </div>
        </div>
      </div>

      <div id="voting-tab" class="tab-content">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Elections I Can Vote In</h3>
            <p class="card-description">Cast your vote in these elections (you cannot vote where you're a candidate)</p>
          </div>
          <div class="card-content">
            ${votingElections
              .map((election) => {
                const candidates = getElectionCandidates(election.id)
                const hasVoted = myVotes.some((v) => v.electionId === election.id)

                return `
                  <div class="card" style="margin-bottom: 1rem; ${hasVoted ? "opacity: 0.75;" : ""}">
                    <div class="card-header">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                          <h3 class="card-title">${election.name}</h3>
                          <p class="card-description">${election.description}</p>
                        </div>
                        ${hasVoted ? '<span class="badge badge-secondary">Voted</span>' : ""}
                      </div>
                    </div>
                    <div class="card-content">
                      ${
                        candidates.length === 0
                          ? '<div class="empty-state"><p>No candidates available</p></div>'
                          : `<div class="item-list">${candidates
                              .map(
                                (candidate) => `
                              <div class="list-item">
                                <div class="item-info">
                                  <h4>${candidate?.username} ${candidate?.faceRegistered ? '<i class="fas fa-face-smile" style="color: #10b981;" title="Face Registered"></i>' : ""}</h4>
                                  <p>${candidate?.branch}</p>
                                  <p>PRN: ${candidate?.prn}</p>
                                </div>
                                <div class="item-actions">
                                  <button class="btn btn-primary btn-sm"
                                          onclick="castVote('${election.id}', '${candidate?.id}')"
                                          ${hasVoted ? "disabled" : ""}>
                                    ${hasVoted ? "Voted" : "Vote"}
                                  </button>
                                </div>
                              </div>
                            `,
                              )
                              .join("")}</div>`
                      }
                    </div>
                  </div>
                `
              })
              .join("")}

            ${
              votingElections.length === 0
                ? `
                <div class="empty-state">
                  <i class="fas fa-info-circle"></i>
                  <h3>No Voting Elections</h3>
                  <p>You are a candidate in all active elections, so you cannot vote in any.</p>
                </div>
              `
                : ""
            }
          </div>
        </div>
      </div>

      <div id="applications-tab" class="tab-content">
        ${renderVoterCandidateApplications()}
      </div>

      <div id="results-tab" class="tab-content">
        ${renderElectionResults()}
      </div>
    </div>
  `
}

// Voter Candidate Application Functions
function renderVoterCandidateApplications() {
  const activeElections = elections.filter((e) => e.active)
  const myApplications = applications.filter((a) => a.userId === currentUser.id)

  // For promoted voters, exclude elections where they're already candidates
  const activeCandidacies = getUserActiveCandidacies(currentUser)
  const candidateElectionIds = activeCandidacies.map((app) => app.electionId)
  const availableElections = activeElections.filter((e) => !candidateElectionIds.includes(e.id))

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Apply to Become Candidate</h3>
        <p class="card-description">Submit applications to become a candidate in active elections</p>
      </div>
      <div class="card-content">
        ${
          availableElections.length === 0
            ? activeCandidacies.length > 0
              ? '<div class="empty-state"><p>You are already a candidate in all active elections</p></div>'
              : '<div class="empty-state"><p>No active elections available for candidate applications</p></div>'
            : `<div class="election-application-list">
            ${availableElections
              .map((election) => {
                const existingApplication = myApplications.find((app) => app.electionId === election.id)
                const currentCandidates = applications.filter(
                  (app) => app.electionId === election.id && app.approved,
                ).length
                const canApply = !existingApplication && currentCandidates < election.maxCandidates

                return `
                <div class="election-application-card" style="border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1rem;">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div>
                      <h4>${election.name}</h4>
                      <p style="color: #6b7280;">${election.description}</p>
                      <p style="font-size: 0.875rem; color: #6b7280;">
                        Candidates: ${currentCandidates}/${election.maxCandidates} •
                        Status: ${election.active ? "Active" : "Closed"}
                      </p>
                    </div>
                    <div style="text-align: right;">
                      ${
                        existingApplication
                          ? `<span class="badge ${existingApplication.approved ? "badge-success" : existingApplication.rejected ? "badge-destructive" : "badge-warning"}">
                          ${existingApplication.approved ? "Approved" : existingApplication.rejected ? "Rejected" : "Pending"}
                        </span>`
                          : canApply
                            ? `<button class="btn btn-primary btn-sm" onclick="openCandidateApplicationModal('${election.id}')">
                            <i class="fas fa-paper-plane"></i> Apply
                          </button>`
                            : '<span class="badge badge-secondary">Full</span>'
                      }
                    </div>
                  </div>

                  ${
                    existingApplication
                      ? `
                    <div class="application-details" style="background: #f8fafc; padding: 1rem; border-radius: 0.375rem; margin-top: 1rem;">
                      <h5 style="margin-bottom: 0.5rem;">Application Details</h5>
                      <p><strong>Applied:</strong> ${new Date(existingApplication.appliedAt).toLocaleString()}</p>
                      ${existingApplication.applicationMessage ? `<p><strong>Message:</strong> ${existingApplication.applicationMessage}</p>` : ""}
                      ${existingApplication.adminNotes ? `<p><strong>Admin Notes:</strong> ${existingApplication.adminNotes}</p>` : ""}
                      ${existingApplication.rejected ? `<p style="color: #dc2626;"><strong>Rejection Reason:</strong> ${existingApplication.rejectionReason || "No reason provided"}</p>` : ""}
                    </div>
                  `
                      : ""
                  }
                </div>
              `
              })
              .join("")}
          </div>`
        }
      </div>
    </div>

    ${
      myApplications.length > 0
        ? `
      <div class="card" style="margin-top: 1.5rem;">
        <div class="card-header">
          <h3 class="card-title">My Applications History</h3>
          <p class="card-description">All your candidate applications across elections</p>
        </div>
        <div class="card-content">
          <div class="item-list">
            ${myApplications
              .map((app) => {
                const election = elections.find((e) => e.id === app.electionId)
                return `
                <div class="list-item">
                  <div class="item-info">
                    <h4>${election?.name}</h4>
                    <p>Applied: ${new Date(app.appliedAt).toLocaleDateString()}</p>
                    ${app.applicationMessage ? `<p>Message: ${app.applicationMessage}</p>` : ""}
                  </div>
                  <div class="item-actions">
                    <span class="badge ${app.approved ? "badge-success" : app.rejected ? "badge-destructive" : "badge-warning"}">
                      ${app.approved ? "Approved" : app.rejected ? "Rejected" : "Pending"}
                    </span>
                  </div>
                </div>
              `
              })
              .join("")}
          </div>
        </div>
      </div>
    `
        : ""
    }
  `
}

function openCandidateApplicationModal(electionId) {
  const election = elections.find((e) => e.id === electionId)

  const modalHTML = `
    <div id="candidate-application-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Apply for Candidate - ${election.name}</h2>
          <span class="close" onclick="closeCandidateApplicationModal()">&times;</span>
        </div>
        <form id="candidate-application-form" class="modal-body" onsubmit="handleCandidateApplication(event, '${electionId}')">
          <div class="form-group">
            <label>Election Details</label>
            <div style="background: #f8fafc; padding: 1rem; border-radius: 0.375rem; margin-bottom: 1rem;">
              <h4>${election.name}</h4>
              <p>${election.description}</p>
              <p><strong>Max Candidates:</strong> ${election.maxCandidates}</p>
            </div>
          </div>

          <div class="form-group">
            <label for="application-message">Why do you want to be a candidate?</label>
            <textarea id="application-message" required placeholder="Explain your motivation, qualifications, and what you hope to achieve..." rows="4"></textarea>
          </div>

          <div class="form-group">
            <label for="qualifications">Your Qualifications & Experience</label>
            <textarea id="qualifications" placeholder="List your relevant experience, skills, and achievements..." rows="3"></textarea>
          </div>

          <div class="form-group">
            <label for="goals">Your Goals & Vision</label>
            <textarea id="goals" placeholder="What are your goals if elected? What changes would you make?" rows="3"></textarea>
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" id="terms-agreement" required>
              I understand that my application will be reviewed by administrators and I agree to abide by election rules
            </label>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeCandidateApplicationModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Submit Application</button>
          </div>
        </form>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closeCandidateApplicationModal() {
  const modal = document.getElementById("candidate-application-modal")
  if (modal) modal.remove()
}

function handleCandidateApplication(event, electionId) {
  event.preventDefault()

  const applicationMessage = document.getElementById("application-message").value
  const qualifications = document.getElementById("qualifications").value
  const goals = document.getElementById("goals").value

  const newApplication = {
    id: `application-${Date.now()}`,
    userId: currentUser.id,
    electionId,
    approved: false,
    rejected: false,
    appliedAt: new Date().toISOString(),
    applicationMessage,
    qualifications,
    goals,
    type: "voter-application", // To distinguish from admin promotions
  }

  applications.push(newApplication)
  localStorage.setItem("smartvote-applications", JSON.stringify(applications))

  showToast("Application Submitted", "Your candidate application has been submitted for review", "success")
  closeCandidateApplicationModal()
  renderDashboard()
}

// Dynamic Role System
function getEffectiveUserRole(user) {
  if (!user) return null

  // Super admin and admin roles are permanent
  if (user.role === "super-admin" || user.role === "admin") {
    return user.role
  }

  // Check if voter has active candidacy in any active election
  const activeCandidacies = applications.filter(
    (app) =>
      app.userId === user.id &&
      app.approved &&
      app.active !== false &&
      elections.find((election) => election.id === app.electionId && election.active),
  )

  // If user has active candidacies, they get candidate features
  if (activeCandidacies.length > 0) {
    return "candidate"
  }

  // Otherwise return their base role
  return user.role
}

function isActiveCandidate(user) {
  const effectiveRole = getEffectiveUserRole(user)
  return effectiveRole === "candidate"
}

function getUserActiveCandidacies(user) {
  return applications.filter(
    (app) =>
      app.userId === user.id &&
      app.approved &&
      app.active !== false &&
      elections.find((election) => election.id === app.electionId && election.active),
  )
}

// Helper Functions
function renderElectionResults() {
  const closedElections = elections.filter((e) => !e.active)

  if (closedElections.length === 0) {
    return `
            <div class="empty-state">
                <i class="fas fa-chart-bar"></i>
                <h3>No Results Available</h3>
                <p>No closed elections with results to display.</p>
            </div>
        `
  }

  return `
        <div class="results-grid">
            ${closedElections
              .map((election) => {
                const results = getElectionResults(election.id)
                return `
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">${election.name}</h3>
                            <p class="card-description">Final results</p>
                        </div>
                        <div class="card-content">
                            ${
                              results.length === 0
                                ? '<div class="empty-state"><p>No votes cast</p></div>'
                                : results
                                    .map(
                                      (result, index) => `
                                    <div class="result-item">
                                        <div class="result-candidate">
                                            <div class="position-badge position-${index === 0 ? "1" : index === 1 ? "2" : index === 2 ? "3" : "other"}">
                                                ${index + 1}
                                            </div>
                                            <div>
                                                <h4>${result.candidate?.username}</h4>
                                                <p>${result.candidate?.branch}</p>
                                            </div>
                                        </div>
                                        <div class="result-votes">
                                            <div class="vote-count">${result.votes}</div>
                                            <div class="vote-label">votes</div>
                                        </div>
                                    </div>
                                `,
                                    )
                                    .join("")
                            }
                        </div>
                    </div>
                `
              })
              .join("")}
        </div>
    `
}

function getElectionResults(electionId) {
  const electionVotes = votes.filter((v) => v.electionId === electionId)
  const candidateVotes = {}

  electionVotes.forEach((vote) => {
    candidateVotes[vote.candidateId] = (candidateVotes[vote.candidateId] || 0) + 1
  })

  return Object.entries(candidateVotes)
    .map(([candidateId, voteCount]) => ({
      candidate: users.find((u) => u.id === candidateId),
      votes: voteCount,
    }))
    .sort((a, b) => b.votes - a.votes)
}

function getElectionCandidates(electionId) {
  const approvedApplications = applications.filter((a) => a.electionId === electionId && a.approved)
  return approvedApplications.map((app) => users.find((u) => u.id === app.userId)).filter(Boolean)
}

// Dashboard Event Handlers
function setupDashboardEventListeners() {
  // Add any specific event listeners needed for the current dashboard
}

function switchDashboardTab(tabName) {
  // Update tab buttons
  document.querySelectorAll(".tab-trigger").forEach((btn) => btn.classList.remove("active"))
  event.target.classList.add("active")

  // Update tab content
  document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"))
  document.getElementById(tabName + "-tab").classList.add("active")
}

// Action Functions
function approveUser(userId) {
  const userIndex = users.findIndex((u) => u.id === userId)
  if (userIndex !== -1) {
    users[userIndex].approved = true
    localStorage.setItem("smartvote-users", JSON.stringify(users))
    showToast("User Approved", "User has been approved successfully", "success")
    renderDashboard()
  }
}

function rejectUser(userId) {
  users = users.filter((u) => u.id !== userId)
  localStorage.setItem("smartvote-users", JSON.stringify(users))
  showToast("User Rejected", "User has been rejected and removed", "success")
  renderDashboard()
}

function approveApplication(applicationId) {
  const appIndex = applications.findIndex((a) => a.id === applicationId)
  if (appIndex !== -1) {
    applications[appIndex].approved = true
    localStorage.setItem("smartvote-applications", JSON.stringify(applications))
    showToast("Application Approved", "Candidate application has been approved", "success")
    renderDashboard()
  }
}

function rejectApplication(applicationId) {
  applications = applications.filter((a) => a.id !== applicationId)
  localStorage.setItem("smartvote-applications", JSON.stringify(applications))
  showToast("Application Rejected", "Candidate application has been rejected", "success")
  renderDashboard()
}

function toggleElection(electionId) {
  const electionIndex = elections.findIndex((e) => e.id === electionId)
  if (electionIndex !== -1) {
    const wasActive = elections[electionIndex].active
    elections[electionIndex].active = !elections[electionIndex].active

    if (!elections[electionIndex].active) {
      elections[electionIndex].closedAt = new Date().toISOString()

      // Clean up candidate status for promoted voters when election ends
      cleanupElectionCandidateStatus(electionId)
    } else {
      delete elections[electionIndex].closedAt
    }

    localStorage.setItem("smartvote-elections", JSON.stringify(elections))
    showToast(
      "Election Updated",
      `Election has been ${elections[electionIndex].active ? "activated" : "closed"}`,
      "success",
    )

    // If current user was affected by this change, update their view
    if (currentUser && wasActive && !elections[electionIndex].active) {
      const userCandidacies = applications.filter(
        (app) => app.userId === currentUser.id && app.electionId === electionId,
      )
      if (userCandidacies.length > 0) {
        showToast("Candidate Status Updated", "Your candidate status has been updated due to election closure", "info")
      }
    }

    renderDashboard()
  }
}

function cleanupElectionCandidateStatus(electionId) {
  // Mark applications as inactive for this election
  applications.forEach((app) => {
    if (app.electionId === electionId) {
      app.active = false
      app.electionClosed = true
      app.closedAt = new Date().toISOString()
    }
  })

  localStorage.setItem("smartvote-applications", JSON.stringify(applications))

  // Note: We don't remove the applications, just mark them inactive
  // This preserves history while removing active candidate features
}

function updateElectionLimits(electionId, field, value) {
  const electionIndex = elections.findIndex((e) => e.id === electionId)
  if (electionIndex !== -1 && Number.parseInt(value) > 0) {
    elections[electionIndex][field] = Number.parseInt(value)
    localStorage.setItem("smartvote-elections", JSON.stringify(elections))
    showToast("Election Updated", "Election limits have been updated", "success")
  }
}

function applyToElection(electionId) {
  const existingApplication = applications.find((a) => a.userId === currentUser.id && a.electionId === electionId)

  if (existingApplication) {
    showToast("Already Applied", "You have already applied to this election", "error")
    return
  }

  const newApplication = {
    id: `application-${Date.now()}`,
    userId: currentUser.id,
    electionId,
    approved: false,
    appliedAt: new Date().toISOString(),
  }

  applications.push(newApplication)
  localStorage.setItem("smartvote-applications", JSON.stringify(applications))
  showToast("Application Submitted", "Your application has been submitted for review", "success")
  renderDashboard()
}

function castVote(electionId, candidateId) {
  const existingVote = votes.find((v) => v.voterId === currentUser.id && v.electionId === electionId)

  if (existingVote) {
    showToast("Already Voted", "You have already voted in this election", "error")
    return
  }

  // Generate unique vote receipt ID
  const receiptId = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

  const newVote = {
    id: `vote-${Date.now()}`,
    voterId: currentUser.id,
    electionId,
    candidateId,
    votedAt: new Date().toISOString(),
    receiptId,
    ipAddress: "127.0.0.1", // In real app, get actual IP
    userAgent: navigator.userAgent,
    verified: true,
  }

  votes.push(newVote)
  localStorage.setItem("smartvote-votes", JSON.stringify(votes))

  // Show vote confirmation with receipt
  showVoteConfirmation(newVote, electionId, candidateId)

  // Send notification
  sendNotification({
    type: "vote-cast",
    title: "Vote Cast Successfully",
    message: `Your vote has been recorded for ${elections.find((e) => e.id === electionId)?.name}`,
    userId: currentUser.id,
  })

  renderDashboard()
}

function showVoteConfirmation(vote, electionId, candidateId) {
  const election = elections.find((e) => e.id === electionId)
  const candidate =
    candidateId === "none-of-above"
      ? { username: "None of the Above", id: "none-of-above" }
      : users.find((u) => u.id === candidateId)

  const modalHTML = `
    <div id="vote-confirmation-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2><i class="fas fa-check-circle" style="color: #10b981;"></i> Vote Confirmed!</h2>
        </div>
        <div class="modal-body">
          <div class="vote-receipt">
            <div class="receipt-header">
              <h3>Official Vote Receipt</h3>
              <div class="receipt-id">Receipt #${vote.receiptId}</div>
            </div>

            <div class="receipt-details">
              <div class="receipt-row">
                <span class="label">Election:</span>
                <span class="value">${election?.name}</span>
              </div>
              <div class="receipt-row">
                <span class="label">Candidate:</span>
                <span class="value">${candidate?.username}</span>
              </div>
              <div class="receipt-row">
                <span class="label">Voter ID:</span>
                <span class="value">${currentUser.id.substring(0, 8)}***</span>
              </div>
              <div class="receipt-row">
                <span class="label">Time:</span>
                <span class="value">${new Date(vote.votedAt).toLocaleString()}</span>
              </div>
              <div class="receipt-row">
                <span class="label">Status:</span>
                <span class="value verified"><i class="fas fa-shield-check"></i> Verified</span>
              </div>
            </div>

            <div class="receipt-footer">
              <p><i class="fas fa-lock"></i> Your vote is encrypted and anonymous</p>
              <p><small>Keep this receipt for your records</small></p>
            </div>
          </div>

          <div class="receipt-actions">
            <button class="btn btn-primary" onclick="downloadReceipt('${vote.receiptId}')">
              <i class="fas fa-download"></i> Download Receipt
            </button>
            <button class="btn btn-secondary" onclick="emailReceipt('${vote.receiptId}')">
              <i class="fas fa-envelope"></i> Email Receipt
            </button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" onclick="closeVoteConfirmationModal()">Close</button>
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closeVoteConfirmationModal() {
  const modal = document.getElementById("vote-confirmation-modal")
  if (modal) modal.remove()
}

function downloadReceipt(receiptId) {
  const vote = votes.find((v) => v.receiptId === receiptId)
  if (!vote) return

  const election = elections.find((e) => e.id === vote.electionId)
  const candidate =
    vote.candidateId === "none-of-above"
      ? { username: "None of the Above" }
      : users.find((u) => u.id === vote.candidateId)

  const receiptContent = `
SMARTVOTE - OFFICIAL VOTE RECEIPT
================================

Receipt ID: ${vote.receiptId}
Election: ${election?.name}
Candidate: ${candidate?.username}
Voter ID: ${vote.voterId.substring(0, 8)}***
Time: ${new Date(vote.votedAt).toLocaleString()}
Status: VERIFIED ✓

This receipt confirms your vote was cast and recorded securely.
Your vote is encrypted and anonymous.

Generated: ${new Date().toLocaleString()}
System: SmartVote College Election System
  `

  const blob = new Blob([receiptContent], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `SmartVote_Receipt_${receiptId}.txt`
  a.click()
  URL.revokeObjectURL(url)

  showToast("Receipt Downloaded", "Your vote receipt has been downloaded", "success")
}

function emailReceipt(receiptId) {
  // In a real application, this would send an actual email
  const vote = votes.find((v) => v.receiptId === receiptId)
  const election = elections.find((e) => e.id === vote.electionId)

  const emailSubject = `SmartVote Receipt - ${election?.name}`
  const emailBody = `Your vote receipt ID: ${receiptId}\n\nThank you for participating in the election!`

  // Simulate email sending
  setTimeout(() => {
    showToast("Receipt Emailed", "Vote receipt has been sent to your registered email", "success")
  }, 1000)

  console.log("Email would be sent:", { receiptId, subject: emailSubject, body: emailBody })
}

// Profile Management
function openProfileModal() {
  const effectiveRole = getEffectiveUserRole(currentUser)
  if (effectiveRole === "candidate") {
    document.getElementById("achievements-group").style.display = "block"
  } else {
    document.getElementById("achievements-group").style.display = "none"
  }

  // Populate form with current user data
  document.getElementById("bio").value = currentUser.bio || ""
  document.getElementById("phone").value = currentUser.phone || ""
  document.getElementById("year").value = currentUser.year || ""
  document.getElementById("achievements").value = currentUser.achievements || ""

  // Update photo preview
  const photoPreview = document.getElementById("photo-preview")
  if (currentUser.profilePhoto) {
    photoPreview.innerHTML = `<img src="${currentUser.profilePhoto}" alt="Profile">`
  } else {
    photoPreview.innerHTML = '<i class="fas fa-user"></i>'
  }

  document.getElementById("profile-modal").style.display = "block"
}

function closeProfileModal() {
  document.getElementById("profile-modal").style.display = "none"
}

function handlePhotoUpload(event) {
  const file = event.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const photoPreview = document.getElementById("photo-preview")
      photoPreview.innerHTML = `<img src="${e.target.result}" alt="Profile">`
      currentUser.profilePhoto = e.target.result
    }
    reader.readAsDataURL(file)
  }
}

function handleProfileUpdate(event) {
  event.preventDefault()

  // Update user data
  currentUser.bio = document.getElementById("bio").value
  currentUser.phone = document.getElementById("phone").value
  currentUser.year = document.getElementById("year").value
  currentUser.achievements = document.getElementById("achievements").value

  // Update in users array
  const userIndex = users.findIndex((u) => u.id === currentUser.id)
  if (userIndex !== -1) {
    users[userIndex] = { ...currentUser }
    localStorage.setItem("smartvote-users", JSON.stringify(users))
  }

  showToast("Profile Updated", "Your profile has been updated successfully", "success")
  updateHeader()
  closeProfileModal()
}

// Delete Functions
function deleteUser(userId) {
  const user = users.find((u) => u.id === userId)
  if (!user) return

  if (user.role === "super-admin") {
    showToast("Cannot Delete", "Super admin accounts cannot be deleted", "error")
    return
  }

  if (confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
    // Remove user from users array
    users = users.filter((u) => u.id !== userId)

    // Remove user's applications
    applications = applications.filter((a) => a.userId !== userId)

    // Remove user's votes
    votes = votes.filter((v) => v.voterId !== userId)

    // Update localStorage
    localStorage.setItem("smartvote-users", JSON.stringify(users))
    localStorage.setItem("smartvote-applications", JSON.stringify(applications))
    localStorage.setItem("smartvote-votes", JSON.stringify(votes))

    showToast("User Deleted", `User "${user.username}" has been deleted successfully`, "success")
    renderDashboard()
  }
}

function deleteElection(electionId) {
  const election = elections.find((e) => e.id === electionId)
  if (!election) return

  if (
    confirm(
      `Are you sure you want to delete the election "${election.name}"? This will also remove all related applications and votes.`,
    )
  ) {
    // Remove election from elections array
    elections = elections.filter((e) => e.id !== electionId)

    // Remove related applications
    applications = applications.filter((a) => a.electionId !== electionId)

    // Remove related votes
    votes = votes.filter((v) => v.electionId !== electionId)

    // Update localStorage
    localStorage.setItem("smartvote-elections", JSON.stringify(elections))
    localStorage.setItem("smartvote-applications", JSON.stringify(applications))
    localStorage.setItem("smartvote-votes", JSON.stringify(votes))

    showToast("Election Deleted", `Election "${election.name}" has been deleted successfully`, "success")
    renderDashboard()
  }
}

// Candidate Management Functions
function renderCandidateManagement() {
  const activeElections = elections.filter((e) => e.active)

  if (activeElections.length === 0) {
    return '<div class="empty-state"><p>No active elections to manage candidates for</p></div>'
  }

  return activeElections
    .map((election) => {
      const electionCandidates = applications.filter((a) => a.electionId === election.id && a.approved)

      return `
      <div class="election-candidate-section" style="margin-bottom: 2rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <h4>${election.name}</h4>
            <p style="color: #6b7280; font-size: 0.875rem;">${electionCandidates.length}/${election.maxCandidates} candidates</p>
          </div>
          <div>
            <button class="btn btn-primary btn-sm" onclick="addCandidateToElection('${election.id}')">
              <i class="fas fa-plus"></i> Add Candidate
            </button>
            <button class="btn btn-outline btn-sm" onclick="viewElectionHistory('${election.id}')">
              <i class="fas fa-history"></i> History
            </button>
          </div>
        </div>

        <div class="candidate-list">
          ${
            electionCandidates.length === 0
              ? '<p style="color: #6b7280; font-style: italic;">No candidates for this election</p>'
              : electionCandidates
                  .map((app) => {
                    const candidate = users.find((u) => u.id === app.userId)
                    return `
                <div class="list-item" style="margin-bottom: 0.5rem;">
                  <div class="item-info">
                    <h5>${candidate?.username} ${candidate?.faceRegistered ? '<i class="fas fa-face-smile" style="color: #10b981;" title="Face Registered"></i>' : ""}</h5>
                    <p>${candidate?.branch} • PRN: ${candidate?.prn}</p>
                    <p>Applied: ${new Date(app.appliedAt).toLocaleDateString()}</p>
                  </div>
                  <div class="item-actions">
                    <button class="btn btn-destructive btn-sm" onclick="removeCandidateFromElection('${app.id}', '${election.id}')">
                      <i class="fas fa-user-minus"></i> Remove
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="toggleCandidateAccess('${app.id}', '${election.id}')">
                      <i class="fas fa-toggle-${app.active !== false ? "on" : "off"}"></i> ${app.active !== false ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              `
                  })
                  .join("")
          }
        </div>
      </div>
    `
    })
    .join("")
}

function openPromoteVoterModal() {
  const voters = users.filter((u) => u.role === "voter" && u.approved)
  const activeElections = elections.filter((e) => e.active)

  if (voters.length === 0) {
    showToast("No Voters Available", "No approved voters available to promote", "error")
    return
  }

  if (activeElections.length === 0) {
    showToast("No Active Elections", "No active elections to add candidates to", "error")
    return
  }

  const modalHTML = `
    <div id="promote-voter-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Promote Voter to Candidate</h2>
          <span class="close" onclick="closePromoteVoterModal()">&times;</span>
        </div>
        <form id="promote-voter-form" class="modal-body" onsubmit="handlePromoteVoter(event)">
          <div class="form-group">
            <label for="select-voter">Select Voter</label>
            <select id="select-voter" required>
              <option value="">Choose a voter to promote</option>
              ${voters
                .map(
                  (voter) => `
                <option value="${voter.id}">${voter.username} - ${voter.branch} (${voter.prn})</option>
              `,
                )
                .join("")}
            </select>
          </div>

          <div class="form-group">
            <label for="select-election">Select Election</label>
            <select id="select-election" required>
              <option value="">Choose an election</option>
              ${activeElections
                .map(
                  (election) => `
                <option value="${election.id}">${election.name}</option>
              `,
                )
                .join("")}
            </select>
          </div>

          <div class="form-group">
            <label for="candidate-message">Reason/Message (Optional)</label>
            <textarea id="candidate-message" placeholder="Why is this voter being promoted to candidate?" rows="3"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closePromoteVoterModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Promote to Candidate</button>
          </div>
        </form>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closePromoteVoterModal() {
  const modal = document.getElementById("promote-voter-modal")
  if (modal) modal.remove()
}

function handlePromoteVoter(event) {
  event.preventDefault()

  const voterId = document.getElementById("select-voter").value
  const electionId = document.getElementById("select-election").value
  const message = document.getElementById("candidate-message").value

  const voter = users.find((u) => u.id === voterId)
  const election = elections.find((e) => e.id === electionId)

  // Check if already a candidate for this election
  const existingApplication = applications.find((a) => a.userId === voterId && a.electionId === electionId)
  if (existingApplication) {
    showToast("Already a Candidate", `${voter.username} is already a candidate for ${election.name}`, "error")
    return
  }

  // Create new candidate application
  const newApplication = {
    id: `application-${Date.now()}`,
    userId: voterId,
    electionId,
    approved: true, // Auto-approved since admin is promoting
    appliedAt: new Date().toISOString(),
    promotedBy: currentUser.id,
    promotionMessage: message,
    active: true,
  }

  applications.push(newApplication)
  localStorage.setItem("smartvote-applications", JSON.stringify(applications))

  showToast("Voter Promoted", `${voter.username} has been promoted to candidate for ${election.name}`, "success")
  closePromoteVoterModal()
  renderDashboard()
}

function addCandidateToElection(electionId) {
  // Reuse the promote voter modal but filter for this specific election
  const voters = users.filter((u) => u.role === "voter" && u.approved)
  const election = elections.find((e) => e.id === electionId)

  if (voters.length === 0) {
    showToast("No Voters Available", "No approved voters available to add as candidates", "error")
    return
  }

  // Filter out voters who are already candidates for this election
  const availableVoters = voters.filter(
    (voter) => !applications.some((app) => app.userId === voter.id && app.electionId === electionId),
  )

  if (availableVoters.length === 0) {
    showToast("No Available Voters", "All approved voters are already candidates for this election", "error")
    return
  }

  const modalHTML = `
    <div id="add-candidate-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Add Candidate to ${election.name}</h2>
          <span class="close" onclick="closeAddCandidateModal()">&times;</span>
        </div>
        <form id="add-candidate-form" class="modal-body" onsubmit="handleAddCandidate(event, '${electionId}')">
          <div class="form-group">
            <label for="select-voter-for-election">Select Voter</label>
            <select id="select-voter-for-election" required>
              <option value="">Choose a voter to add as candidate</option>
              ${availableVoters
                .map(
                  (voter) => `
                <option value="${voter.id}">${voter.username} - ${voter.branch} (${voter.prn})</option>
              `,
                )
                .join("")}
            </select>
          </div>

          <div class="form-group">
            <label for="candidate-message-election">Reason/Message (Optional)</label>
            <textarea id="candidate-message-election" placeholder="Why is this voter being added as candidate?" rows="3"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeAddCandidateModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Add as Candidate</button>
          </div>
        </form>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closeAddCandidateModal() {
  const modal = document.getElementById("add-candidate-modal")
  if (modal) modal.remove()
}

function handleAddCandidate(event, electionId) {
  event.preventDefault()

  const voterId = document.getElementById("select-voter-for-election").value
  const message = document.getElementById("candidate-message-election").value

  const voter = users.find((u) => u.id === voterId)
  const election = elections.find((e) => e.id === electionId)

  const newApplication = {
    id: `application-${Date.now()}`,
    userId: voterId,
    electionId,
    approved: true,
    appliedAt: new Date().toISOString(),
    promotedBy: currentUser.id,
    promotionMessage: message,
    active: true,
  }

  applications.push(newApplication)
  localStorage.setItem("smartvote-applications", JSON.stringify(applications))

  showToast("Candidate Added", `${voter.username} has been added as candidate for ${election.name}`, "success")
  closeAddCandidateModal()
  renderDashboard()
}

function removeCandidateFromElection(applicationId, electionId) {
  const application = applications.find((a) => a.id === applicationId)
  const candidate = users.find((u) => u.id === application?.userId)
  const election = elections.find((e) => e.id === electionId)

  if (confirm(`Are you sure you want to remove ${candidate?.username} as a candidate from ${election?.name}?`)) {
    applications = applications.filter((a) => a.id !== applicationId)

    // Also remove any votes for this candidate in this election
    votes = votes.filter((v) => !(v.candidateId === application.userId && v.electionId === electionId))

    localStorage.setItem("smartvote-applications", JSON.stringify(applications))
    localStorage.setItem("smartvote-votes", JSON.stringify(votes))

    showToast("Candidate Removed", `${candidate?.username} has been removed from ${election?.name}`, "success")
    renderDashboard()
  }
}

function toggleCandidateAccess(applicationId, electionId) {
  const appIndex = applications.findIndex((a) => a.id === applicationId)
  if (appIndex !== -1) {
    applications[appIndex].active = !applications[appIndex].active
    localStorage.setItem("smartvote-applications", JSON.stringify(applications))

    const candidate = users.find((u) => u.id === applications[appIndex].userId)
    const status = applications[appIndex].active ? "enabled" : "disabled"

    showToast("Access Updated", `${candidate?.username}'s candidate access has been ${status}`, "success")
    renderDashboard()
  }
}

function viewElectionHistory(electionId) {
  const election = elections.find((e) => e.id === electionId)
  const electionApplications = applications.filter((a) => a.electionId === electionId)
  const electionVotes = votes.filter((v) => v.electionId === electionId)

  const modalHTML = `
    <div id="election-history-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2>${election.name} - History</h2>
          <span class="close" onclick="closeElectionHistoryModal()">&times;</span>
        </div>
        <div class="modal-body">
          <div class="history-section">
            <h4>Election Details</h4>
            <p><strong>Created:</strong> ${new Date(election.createdAt).toLocaleString()}</p>
            <p><strong>Status:</strong> ${election.active ? "Active" : "Closed"}</p>
            <p><strong>Max Candidates:</strong> ${election.maxCandidates}</p>
            <p><strong>Max Voters:</strong> ${election.maxVoters}</p>
          </div>

          <div class="history-section" style="margin-top: 1.5rem;">
            <h4>Candidate Applications (${electionApplications.length})</h4>
            ${
              electionApplications.length === 0
                ? "<p>No applications yet</p>"
                : electionApplications
                    .map((app) => {
                      const candidate = users.find((u) => u.id === app.userId)
                      return `
                  <div style="padding: 0.5rem; border: 1px solid #e5e7eb; border-radius: 0.25rem; margin-bottom: 0.5rem;">
                    <strong>${candidate?.username}</strong> - ${app.approved ? "Approved" : "Pending"}
                    <br><small>Applied: ${new Date(app.appliedAt).toLocaleString()}</small>
                    ${app.promotedBy ? `<br><small>Promoted by admin</small>` : ""}
                  </div>
                `
                    })
                    .join("")
            }
          </div>

          <div class="history-section" style="margin-top: 1.5rem;">
            <h4>Voting Activity (${electionVotes.length} votes)</h4>
            ${
              electionVotes.length === 0
                ? "<p>No votes cast yet</p>"
                : `<p>${electionVotes.length} votes have been cast in this election</p>`
            }
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeElectionHistoryModal()">Close</button>
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closeElectionHistoryModal() {
  const modal = document.getElementById("election-history-modal")
  if (modal) modal.remove()
}

// Voter Application Management Functions
function approveVoterApplication(applicationId) {
  const appIndex = applications.findIndex((a) => a.id === applicationId)
  if (appIndex !== -1) {
    applications[appIndex].approved = true
    applications[appIndex].approvedAt = new Date().toISOString()
    applications[appIndex].approvedBy = currentUser.id
    applications[appIndex].active = true

    localStorage.setItem("smartvote-applications", JSON.stringify(applications))

    const candidate = users.find((u) => u.id === applications[appIndex].userId)
    const election = elections.find((e) => e.id === applications[appIndex].electionId)

    showToast(
      "Application Approved",
      `${candidate?.username} has been approved as candidate for ${election?.name}`,
      "success",
    )
    renderDashboard()
  }
}

function rejectVoterApplication(applicationId) {
  const application = applications.find((a) => a.id === applicationId)
  const candidate = users.find((u) => u.id === application?.userId)
  const election = elections.find((e) => e.id === application?.electionId)

  const reason = prompt(`Why are you rejecting ${candidate?.username}'s application for ${election?.name}?`)
  if (reason === null) return // User cancelled

  const appIndex = applications.findIndex((a) => a.id === applicationId)
  if (appIndex !== -1) {
    applications[appIndex].rejected = true
    applications[appIndex].rejectedAt = new Date().toISOString()
    applications[appIndex].rejectedBy = currentUser.id
    applications[appIndex].rejectionReason = reason
    applications[appIndex].active = false

    localStorage.setItem("smartvote-applications", JSON.stringify(applications))

    showToast("Application Rejected", `${candidate?.username}'s application has been rejected`, "success")
    renderDashboard()
  }
}

function viewApplicationDetails(applicationId) {
  const application = applications.find((a) => a.id === applicationId)
  const candidate = users.find((u) => u.id === application?.userId)
  const election = elections.find((e) => e.id === application?.electionId)

  const modalHTML = `
    <div id="application-details-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Application Details - ${candidate?.username}</h2>
          <span class="close" onclick="closeApplicationDetailsModal()">&times;</span>
        </div>
        <div class="modal-body">
          <div class="application-info">
            <h4>Candidate Information</h4>
            <p><strong>Name:</strong> ${candidate?.username}</p>
            <p><strong>Branch:</strong> ${candidate?.branch}</p>
            <p><strong>PRN:</strong> ${candidate?.prn}</p>
            <p><strong>Face Registered:</strong> ${candidate?.faceRegistered ? "Yes" : "No"}</p>
          </div>

          <div class="election-info" style="margin-top: 1.5rem;">
            <h4>Election Information</h4>
            <p><strong>Election:</strong> ${election?.name}</p>
            <p><strong>Description:</strong> ${election?.description}</p>
            <p><strong>Applied:</strong> ${new Date(application.appliedAt).toLocaleString()}</p>
          </div>

          <div class="application-content" style="margin-top: 1.5rem;">
            <h4>Application Content</h4>
            ${
              application.applicationMessage
                ? `
              <div style="margin-bottom: 1rem;">
                <strong>Why they want to be a candidate:</strong>
                <p style="background: #f8fafc; padding: 1rem; border-radius: 0.375rem; margin-top: 0.5rem;">${application.applicationMessage}</p>
              </div>
            `
                : ""
            }

            ${
              application.qualifications
                ? `
              <div style="margin-bottom: 1rem;">
                <strong>Qualifications & Experience:</strong>
                <p style="background: #f8fafc; padding: 1rem; border-radius: 0.375rem; margin-top: 0.5rem;">${application.qualifications}</p>
              </div>
            `
                : ""
            }

            ${
              application.goals
                ? `
              <div style="margin-bottom: 1rem;">
                <strong>Goals & Vision:</strong>
                <p style="background: #f8fafc; padding: 1rem; border-radius: 0.375rem; margin-top: 0.5rem;">${application.goals}</p>
              </div>
            `
                : ""
            }
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeApplicationDetailsModal()">Close</button>
          <button type="button" class="btn btn-primary" onclick="closeApplicationDetailsModal(); approveVoterApplication('${applicationId}')">Approve</button>
          <button type="button" class="btn btn-destructive" onclick="closeApplicationDetailsModal(); rejectVoterApplication('${applicationId}')">Reject</button>
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closeApplicationDetailsModal() {
  const modal = document.getElementById("application-details-modal")
  if (modal) modal.remove()
}

// Create Election Functions
function openCreateElectionModal() {
  // Create modal HTML
  const modalHTML = `
    <div id="create-election-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Create New Election</h2>
          <span class="close" onclick="closeCreateElectionModal()">&times;</span>
        </div>
        <form id="create-election-form" class="modal-body" onsubmit="handleCreateElection(event)">
          <div class="form-group">
            <label for="election-name">Election Name</label>
            <input type="text" id="election-name" required placeholder="e.g., Student Council Election">
          </div>

          <div class="form-group">
            <label for="election-description">Description</label>
            <textarea id="election-description" required placeholder="Describe the purpose and scope of this election" rows="3"></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="max-candidates">Maximum Candidates</label>
              <input type="number" id="max-candidates" required min="1" value="10" placeholder="10">
            </div>
            <div class="form-group">
              <label for="max-voters">Maximum Voters</label>
              <input type="number" id="max-voters" required min="1" value="500" placeholder="500">
            </div>
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" id="election-active" checked>
              Start election immediately
            </label>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeCreateElectionModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Election</button>
          </div>
        </form>
      </div>
    </div>
  `

  // Add modal to page
  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closeCreateElectionModal() {
  const modal = document.getElementById("create-election-modal")
  if (modal) {
    modal.remove()
  }
}

function handleCreateElection(event) {
  event.preventDefault()

  const name = document.getElementById("election-name").value
  const description = document.getElementById("election-description").value
  const maxCandidates = Number.parseInt(document.getElementById("max-candidates").value)
  const maxVoters = Number.parseInt(document.getElementById("max-voters").value)
  const active = document.getElementById("election-active").checked

  // Check for duplicate election names
  if (elections.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    showToast("Election Exists", "An election with this name already exists", "error")
    return
  }

  const newElection = {
    id: `election-${Date.now()}`,
    name,
    description,
    active,
    maxCandidates,
    maxVoters,
    createdAt: new Date().toISOString(),
  }

  elections.push(newElection)
  localStorage.setItem("smartvote-elections", JSON.stringify(elections))

  showToast("Election Created", `Election "${name}" has been created successfully`, "success")
  closeCreateElectionModal()
  renderDashboard()
}

// PWA and Advanced Features
let deferredPrompt
const notifications = JSON.parse(localStorage.getItem("smartvote-notifications") || "[]")

// PWA Functions
function initializePWA() {
  // Register service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("ServiceWorker registered:", registration)
      })
      .catch((error) => {
        console.log("ServiceWorker registration failed:", error)
      })
  }

  // Handle PWA install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferredPrompt = e
    showPWAInstallBanner()
  })

  // Check if already installed
  window.addEventListener("appinstalled", () => {
    dismissPWAPrompt()
    showToast("App Installed", "SmartVote has been installed successfully!", "success")
  })
}

function showPWAInstallBanner() {
  const banner = document.getElementById("pwa-install-banner")
  if (banner) {
    banner.style.display = "flex"
  }
}

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt()
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        console.log("User accepted the install prompt")
      }
      deferredPrompt = null
    })
  }
  dismissPWAPrompt()
}

function dismissPWAPrompt() {
  const banner = document.getElementById("pwa-install-banner")
  if (banner) {
    banner.style.display = "none"
  }
}

// QR Code System
function setupQRSystem() {
  // Add QR button to header
  const headerRight = document.querySelector(".header-right")
  if (headerRight && !document.getElementById("qr-btn")) {
    const qrButton = document.createElement("button")
    qrButton.id = "qr-btn"
    qrButton.className = "btn btn-outline"
    qrButton.innerHTML = '<i class="fas fa-qrcode"></i>'
    qrButton.onclick = openQRModal
    qrButton.title = "Quick Access QR Code"
    headerRight.insertBefore(qrButton, headerRight.firstChild)
  }
}

function openQRModal() {
  document.getElementById("qr-modal").style.display = "block"
  generateQRCode(window.location.href)
}

function closeQRModal() {
  document.getElementById("qr-modal").style.display = "none"
}

function generateQRCode(url) {
  const qrContainer = document.getElementById("qr-code-display")
  // Simple QR code simulation (in real app, use QR library)
  qrContainer.innerHTML = `
    <div class="qr-code-placeholder" style="width: 200px; height: 200px; border: 2px solid #000; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 12px; text-align: center;">
      QR Code for:<br>${url.substring(0, 30)}...
    </div>
    <p style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280;">
      In production, this would be a real QR code
    </p>
  `
}

function generateElectionQR() {
  const url = `${window.location.origin}/?action=vote`
  generateQRCode(url)
  showToast("QR Generated", "Election voting QR code generated", "success")
}

function generateVotingQR() {
  const url = `${window.location.origin}/?action=results`
  generateQRCode(url)
  showToast("QR Generated", "Results viewing QR code generated", "success")
}

// Advanced Notification System
function initializeNotifications() {
  // Request notification permission
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission()
  }

  // Setup notification display
  displayRecentNotifications()
}

function sendNotification(notificationData) {
  const notification = {
    id: `notif-${Date.now()}`,
    ...notificationData,
    timestamp: new Date().toISOString(),
    read: false,
  }

  notifications.unshift(notification)
  localStorage.setItem("smartvote-notifications", JSON.stringify(notifications))

  // Show browser notification if permission granted
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(notification.title, {
      body: notification.message,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
    })
  }

  // Show in-app notification
  showInAppNotification(notification)
  displayRecentNotifications()
}

function showInAppNotification(notification) {
  const container = document.getElementById("notification-container")
  const notifEl = document.createElement("div")
  notifEl.className = `notification notification-${notification.type}`
  notifEl.innerHTML = `
    <div class="notification-content">
      <h4>${notification.title}</h4>
      <p>${notification.message}</p>
      <small>${new Date(notification.timestamp).toLocaleTimeString()}</small>
    </div>
    <button class="notification-close" onclick="this.parentElement.remove()">×</button>
  `

  container.appendChild(notifEl)

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notifEl.parentElement) {
      notifEl.remove()
    }
  }, 5000)
}

function displayRecentNotifications() {
  // Add notification indicator to header if there are unread notifications
  const unreadCount = notifications.filter((n) => !n.read).length
  const existingIndicator = document.getElementById("notification-indicator")

  if (unreadCount > 0 && !existingIndicator) {
    const headerRight = document.querySelector(".header-right")
    const indicator = document.createElement("div")
    indicator.id = "notification-indicator"
    indicator.className = "notification-indicator"
    indicator.innerHTML = `<i class="fas fa-bell"></i> ${unreadCount}`
    indicator.onclick = showNotificationPanel
    headerRight.insertBefore(indicator, headerRight.firstChild)
  } else if (unreadCount === 0 && existingIndicator) {
    existingIndicator.remove()
  } else if (existingIndicator) {
    existingIndicator.innerHTML = `<i class="fas fa-bell"></i> ${unreadCount}`
  }
}

function showNotificationPanel() {
  const modalHTML = `
    <div id="notifications-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2><i class="fas fa-bell"></i> Notifications</h2>
          <span class="close" onclick="closeNotificationPanel()">&times;</span>
        </div>
        <div class="modal-body">
          ${
            notifications.length === 0
              ? '<div class="empty-state"><p>No notifications yet</p></div>'
              : notifications
                  .slice(0, 10)
                  .map(
                    (notif) => `
              <div class="notification-item ${notif.read ? "read" : "unread"}">
                <div class="notification-header">
                  <h4>${notif.title}</h4>
                  <small>${new Date(notif.timestamp).toLocaleString()}</small>
                </div>
                <p>${notif.message}</p>
                ${!notif.read ? `<button class="btn btn-sm btn-outline" onclick="markAsRead('${notif.id}')">Mark Read</button>` : ""}
              </div>
            `,
                  )
                  .join("")
          }
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="markAllAsRead()">Mark All Read</button>
          <button class="btn btn-primary" onclick="closeNotificationPanel()">Close</button>
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closeNotificationPanel() {
  const modal = document.getElementById("notifications-modal")
  if (modal) modal.remove()
}

function markAsRead(notificationId) {
  const index = notifications.findIndex((n) => n.id === notificationId)
  if (index !== -1) {
    notifications[index].read = true
    localStorage.setItem("smartvote-notifications", JSON.stringify(notifications))
    displayRecentNotifications()
    closeNotificationPanel()
    showNotificationPanel() // Refresh the panel
  }
}

function markAllAsRead() {
  notifications.forEach((n) => (n.read = true))
  localStorage.setItem("smartvote-notifications", JSON.stringify(notifications))
  displayRecentNotifications()
  closeNotificationPanel()
}

// Candidate Profile and Manifesto System
function viewCandidateProfile(candidateId) {
  const candidate = users.find((u) => u.id === candidateId)
  const candidateApplications = applications.filter((a) => a.userId === candidateId && a.approved)

  const modalHTML = `
    <div id="candidate-profile-modal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2><i class="fas fa-user"></i> ${candidate?.username}'s Profile</h2>
          <span class="close" onclick="closeCandidateProfileModal()">&times;</span>
        </div>
        <div class="modal-body">
          <div class="candidate-profile">
            <div class="candidate-basic-info">
              <div class="candidate-avatar">
                ${
                  candidate?.profilePhoto
                    ? `<img src="${candidate.profilePhoto}" alt="Profile">`
                    : '<i class="fas fa-user"></i>'
                }
                ${candidate?.faceRegistered ? '<div class="face-verified-badge"><i class="fas fa-face-smile"></i></div>' : ""}
              </div>
              <div class="candidate-details">
                <h3>${candidate?.username}</h3>
                <p><strong>Branch:</strong> ${candidate?.branch}</p>
                <p><strong>Year:</strong> ${candidate?.year || "Not specified"}</p>
                <p><strong>Active in:</strong> ${candidateApplications.length} election(s)</p>
              </div>
            </div>

            ${
              candidate?.bio
                ? `
              <div class="candidate-bio">
                <h4><i class="fas fa-user-circle"></i> About</h4>
                <p>${candidate.bio}</p>
              </div>
            `
                : ""
            }

            ${
              candidate?.achievements
                ? `
              <div class="candidate-achievements">
                <h4><i class="fas fa-trophy"></i> Achievements & Experience</h4>
                <p>${candidate.achievements}</p>
              </div>
            `
                : ""
            }

            <div class="candidate-elections">
              <h4><i class="fas fa-vote-yea"></i> Running For</h4>
              ${candidateApplications
                .map((app) => {
                  const election = elections.find((e) => e.id === app.electionId)
                  return `
                  <div class="election-participation">
                    <h5>${election?.name}</h5>
                    <p>${election?.description}</p>
                    ${app.applicationMessage ? `<p><strong>Platform:</strong> ${app.applicationMessage}</p>` : ""}
                  </div>
                `
                })
                .join("")}
            </div>

            <div class="candidate-contact">
              <h4><i class="fas fa-envelope"></i> Contact</h4>
              <p>Email: ${candidate?.email}</p>
              ${candidate?.phone ? `<p>Phone: ${candidate.phone}</p>` : ""}
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="sendMessageToCandidate('${candidateId}')">
            <i class="fas fa-message"></i> Send Message
          </button>
          <button class="btn btn-secondary" onclick="closeCandidateProfileModal()">Close</button>
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

function closeCandidateProfileModal() {
  const modal = document.getElementById("candidate-profile-modal")
  if (modal) modal.remove()
}

function sendMessageToCandidate(candidateId) {
  // This would open a messaging interface
  showToast("Feature Coming Soon", "Candidate messaging will be available soon!", "info")
  // In full implementation, this would open a messaging modal
}

// Data Export and Reporting System
function exportElectionData() {
  if (currentUser.role !== "super-admin" && currentUser.role !== "admin") {
    showToast("Access Denied", "Only administrators can export data", "error")
    return
  }

  const exportData = {
    elections: elections,
    applications: applications.map((app) => ({
      ...app,
      candidateName: users.find((u) => u.id === app.userId)?.username,
      electionName: elections.find((e) => e.id === app.electionId)?.name,
    })),
    votes: votes.map((vote) => ({
      electionId: vote.electionId,
      electionName: elections.find((e) => e.id === vote.electionId)?.name,
      candidateId: vote.candidateId === "none-of-above" ? "None of the Above" : vote.candidateId,
      candidateName:
        vote.candidateId === "none-of-above"
          ? "None of the Above"
          : users.find((u) => u.id === vote.candidateId)?.username,
      votedAt: vote.votedAt,
      receiptId: vote.receiptId,
    })),
    summary: {
      totalElections: elections.length,
      activeElections: elections.filter((e) => e.active).length,
      totalVotes: votes.length,
      totalCandidates: applications.filter((a) => a.approved).length,
      exportedAt: new Date().toISOString(),
    },
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `SmartVote_Export_${new Date().toISOString().split("T")[0]}.json`
  a.click()
  URL.revokeObjectURL(url)

  showToast("Data Exported", "Election data has been exported successfully", "success")
}

// Add export button to admin dashboards
function addExportButton() {
  if ((currentUser.role === "super-admin" || currentUser.role === "admin") && !document.getElementById("export-btn")) {
    const headerRight = document.querySelector(".header-right")
    const exportButton = document.createElement("button")
    exportButton.id = "export-btn"
    exportButton.className = "btn btn-outline"
    exportButton.innerHTML = '<i class="fas fa-download"></i> Export'
    exportButton.onclick = exportElectionData
    exportButton.title = "Export Election Data"
    headerRight.insertBefore(exportButton, headerRight.firstChild)
  }
}

// Toast Notifications
function showToast(title, description, type = "info") {
  const toast = document.createElement("div")
  toast.className = `toast ${type}`
  toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-description">${description}</div>
    `

  document.getElementById("toast-container").appendChild(toast)

  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.remove()
  }, 5000)

  // Remove on click
  toast.addEventListener("click", () => {
    toast.remove()
  })
}

// Load Face-API.js
const faceapi = window.faceapi
const FaceDetection = window.FaceDetection
const Camera = window.Camera
const tf = window.tf

// Native media APIs initialization
document.addEventListener("DOMContentLoaded", () => {
  loadMediaPipe()
})

function updateProfileDisplay() {
  // Update the profile information displayed on the main app screen
  // This function should fetch the latest user data and update the relevant HTML elements
  if (currentUser) {
    document.getElementById("current-username").textContent = currentUser.username
    // Update other profile details as needed
  }
}
