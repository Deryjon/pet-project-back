module.exports = {
  apps: [
    {
      name: "konkurent-api",
      script: "dist/main.js",
      cwd: "/home/deryjon/pet-project-back",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
