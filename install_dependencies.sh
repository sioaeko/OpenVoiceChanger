#!/bin/bash
set -e

echo "=== OpenVoiceChanger Dependency Installer ==="

# Server dependencies
echo ""
echo "Installing server dependencies..."
cd server
npm install
cd ..

# Client dependencies
echo ""
echo "Installing client dependencies..."
cd client/src/public
npm install
cd ../../..

# Python dependencies
echo ""
echo "Installing Python dependencies..."
cd python_server
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  source venv/Scripts/activate
else
  source venv/bin/activate
fi

pip install -r requirements.txt
deactivate
cd ..

# Create model directories
echo ""
echo "Creating model directories..."
mkdir -p server/models
mkdir -p python_server/models

echo ""
echo "All dependencies installed successfully!"
echo ""
echo "To start the application:"
echo "  1. Server:  cd server && npm start"
echo "  2. Python:  cd python_server && source venv/bin/activate && python python_server.py"
echo "  3. Client:  cd client/src/public && npm start"
