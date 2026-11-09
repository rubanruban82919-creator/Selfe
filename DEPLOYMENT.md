# RetinaGuard AI – Cloud & Production Deployment Guide

This guide covers step-by-step instructions for deploying **RetinaGuard AI** to Cloud Platform-as-a-Service (PaaS) providers and local production servers.

---

## 🎯 Recommended Cloud Platforms for Deep Learning / TensorFlow

Because RetinaGuard AI includes **TensorFlow 2.15** and deep convolutional models with Grad-CAM, the server requires at least **1 GB RAM** at runtime.

| Platform | Free Tier RAM | Best For | Recommended Setup |
|---|:---:|---|---|
| **1. Hugging Face Spaces** ⭐ *(Top Pick)* | **16 GB RAM (Free)** | Machine Learning & Medical AI apps | Docker SDK Space |
| **2. Render.com** | 512 MB (Free) / 1 GB (Starter) | General Web Apps | Docker Web Service (`render.yaml`) |
| **3. Railway.app** | 512 MB (Trial) / Pay-per-use | Full-stack production apps | Auto-detected Dockerfile |
| **4. Local Windows / Windows Server** | Host RAM | Local clinical LAN deployment | Waitress WSGI (`start_production.bat`) |

---

## 🚀 Option 1: Deploy to Hugging Face Spaces (Recommended – Free 16GB RAM)

Hugging Face Spaces provides a free 2 vCPU + 16 GB RAM environment with public HTTPS URL and no memory limitations.

### Step-by-Step Instructions:

1. **Create an account** on [Hugging Face](https://huggingface.co/) if you don't have one.
2. Click your profile avatar (top right) ➔ **New Space** (or visit [huggingface.co/new-space](https://huggingface.co/new-space)).
3. Configure your Space:
   - **Space name**: `retinaguard-ai`
   - **License**: `mit` or `apache-2.0`
   - **Space SDK**: Select **`Docker`** ➔ **`Blank`**
   - **Space hardware**: `CPU basic • 2 vCPU • 16GB RAM` *(Free)*
   - **Visibility**: `Public` (or `Private`)
4. Click **Create Space**.
5. Push your project code to Hugging Face:
   ```powershell
   cd C:\Users\ruban\.gemini\antigravity\scratch\RetinaGuard-AI

   # Initialize git if not already initialized
   git init
   git add .
   git commit -m "Deploy RetinaGuard AI to Hugging Face Spaces"

   # Add Hugging Face remote (replace USERNAME with your HF username)
   git remote add hf https://huggingface.co/spaces/YOUR_USERNAME/retinaguard-ai
   git push -u hf main
   ```
6. **Done!** Hugging Face automatically builds the `Dockerfile` and serves RetinaGuard AI on port `7860`.
   - Your web app is immediately accessible at:
     `https://huggingface.co/spaces/YOUR_USERNAME/retinaguard-ai`

---

## 🌐 Option 2: Deploy to Render.com

Render.com natively supports Docker web services and provides automatic SSL certificates.

### Step-by-Step Instructions:

1. **Push your code to GitHub**:
   ```powershell
   cd C:\Users\ruban\.gemini\antigravity\scratch\RetinaGuard-AI
   git init
   git add .
   git commit -m "Initial RetinaGuard AI release"
   git remote add origin https://github.com/YOUR_GITHUB_USER/retinaguard-ai.git
   git push -u origin main
   ```
   *(Ensure `.dockerignore` excludes the 9GB `dataset/` directory so uploads take under a minute!)*

2. **Log into [Render.com](https://render.com/)**:
   - Click **New +** ➔ **Web Service**.
   - Connect your GitHub repository `retinaguard-ai`.

3. **Configure Service Settings**:
   - **Name**: `retinaguard-ai`
   - **Language / Runtime**: **`Docker`**
   - **Region**: Closest to you (e.g. Frankfurt, Oregon, Singapore)
   - **Branch**: `main`
   - **Instance Type**:
     - *Starter (1 GB RAM)* is recommended for TensorFlow inference.
   
4. **Environment Variables**:
   Under the **Environment Variables** tab, add:
   - `FLASK_ENV` = `production`
   - `SECRET_KEY` = *(click "Generate" or enter a random 32-character string)*
   - `WTF_CSRF_SECRET_KEY` = *(click "Generate")*

5. Click **Create Web Service**.
   Render will build the container using [`Dockerfile`](file:///Dockerfile) and provide a public URL like:
   `https://retinaguard-ai.onrender.com`

---

## 🚆 Option 3: Deploy to Railway.app

1. Go to [Railway.app](https://railway.app/) and sign in with GitHub.
2. Click **New Project** ➔ **Deploy from GitHub repo**.
3. Select your `retinaguard-ai` repository.
4. Railway will automatically detect the [`Dockerfile`](file:///Dockerfile).
5. In **Variables**, add:
   - `FLASK_ENV` = `production`
   - `PORT` = `7860`
6. Click **Deploy**. Railway will provision your app with a public domain under `*.up.railway.app`.

---

## 🖥️ Option 4: Deploy Locally on Windows (Production WSGI via Waitress)

If you are running the application in a clinic, hospital LAN, or on a local Windows Server:

1. Ensure dependencies are installed in your venv:
   ```powershell
   .\venv\Scripts\python.exe -m pip install waitress
   ```

2. Run the production launcher:
   ```powershell
   .\start_production.bat
   ```
   Or via command line:
   ```powershell
   .\venv\Scripts\python.exe -m waitress --listen=0.0.0.0:5000 --threads=4 wsgi:app
   ```

3. The system is now serving multi-threaded production requests on:
   - Locally: `http://127.0.0.1:5000`
   - On your local clinic LAN: `http://YOUR_LOCAL_IP:5000`

---

## 🔒 Post-Deployment Security Checklist

- [x] Change the default passwords for `admin` (`Admin@12345`) and `dr_vance` (`Doctor@12345`) in `/profile` after first login.
- [x] Set strong random `SECRET_KEY` and `WTF_CSRF_SECRET_KEY` in environment variables.
- [x] Verify the trained model weights [`models/dr_model.h5`](file:///models/dr_model.h5) are included in the deployment build.
- [x] Verify the large dataset [`dataset/`](file:///dataset/) is excluded from the build context via [`.dockerignore`](file:///.dockerignore) to prevent huge image sizes.
- [x] Verify medical disclaimers are visible on all screening outputs.
