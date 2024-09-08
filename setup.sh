#!/bin/bash

# Detect operating system
if [ "$(uname)" == "Darwin" ]; then
    # macOS
    echo "Detected macOS, using Homebrew to install dependencies..."
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "Homebrew not found, installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    echo "Installing PostgreSQL via Homebrew..."
    brew install postgresql

elif [ -f /etc/debian_version ]; then
    # Debian/Ubuntu-based
    echo "Detected Debian-based OS, using apt-get to install dependencies..."
    sudo apt-get update
    sudo apt-get install -y libpq-dev

elif [ -f /etc/redhat-release ]; then
    # RedHat/CentOS-based
    echo "Detected RedHat-based OS, using yum to install dependencies..."
    sudo yum install -y postgresql-devel

else
    echo "Unsupported operating system."
    exit 1
fi

# Create virtual environment and install Python dependencies
python3 -m venv showcase
source ./showcase/bin/activate
python3 -m pip install selenium
python3 -m pip install requests
python3 -m pip install Flask
python3 -m pip install psycopg2-binary  # Use binary version to avoid building issues

