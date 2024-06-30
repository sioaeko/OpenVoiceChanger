#!/bin/bash

# Client dependencies
echo "Installing client dependencies..."
cd client
npm install
cd ..

# Server dependencies
echo "Installing server dependencies..."
cd server
npm install
cd ..

# Python dependencies
echo "Installing Python dependencies..."
cd python_server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

echo "All dependencies installed successfully."
