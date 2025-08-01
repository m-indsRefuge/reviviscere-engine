# Use the official Node.js 20 image as our base
FROM node:20

# Set the working directory inside the container
WORKDIR /app

# Copy all project files from the host into the container's working directory
COPY . .

# Install dependencies for the Watchtower agent (we will add other agents here later)
# This pre-installs the dependencies so the image is ready to run tests immediately.
RUN npm --prefix ./agents/watchtower install

# The default command can be empty, as we will specify the test command
# directly in our docker-compose file.
CMD ["node"]
