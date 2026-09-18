module.exports = {
  apps: [
    {
      name: 'vidhyalayam',
      script: 'npm',
      args: 'run start',
      cwd: '/var/www/vidhyalayam',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1.2G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'worker-demand',
      script: 'npm',
      args: 'run worker:demand-slips',
      cwd: '/var/www/vidhyalayam',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker-notifications',
      script: 'npm',
      args: 'run worker:notifications',
      cwd: '/var/www/vidhyalayam',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker-exports',
      script: 'npm',
      args: 'run worker:exports',
      cwd: '/var/www/vidhyalayam',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker-audit',
      script: 'npm',
      args: 'run worker:audit-retention',
      cwd: '/var/www/vidhyalayam',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
