#!/usr/bin/env bash
set -e

# 1 Build React frontend
cd frontend
npm install
npm run build
cd ..

# 2 Copy frontend build to backend (so Flask can serve it)
rm -rf backend/build
cp -r frontend/build backend/build

# 3 Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..
