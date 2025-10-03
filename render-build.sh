#!/usr/bin/env bash
# Install frontend dependencies and build
cd frontend
npm install
npm run build
cd ..

# Move build folder into backend
rm -rf backend/build
cp -r frontend/build backend/

# Install backend dependencies
cd backend
pip install -r requirements.txt
