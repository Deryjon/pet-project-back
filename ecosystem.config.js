module.exports = {
  apps: [
    {
      name: "konkurent-api",
      script: "dist/main.js",
      env: {
        NODE_ENV: "production",
        JWT_SECRET: "supersecretkey123",
        DATABASE_URL: "postgresql://crm_user:crm_password@localhost:5432/crm_db?schema=public"
      }
    }
  ]
};
