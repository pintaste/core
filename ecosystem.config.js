module.exports = {
  apps: [{
    name: 'mx-core',
    script: 'out/main.mjs',
    cwd: '/home/ubuntu/mx-core/apps/core',
    env: {
      NODE_ENV: 'production',
      PORT: 2333
    },
    node_args: '',
    max_memory_restart: '500M',
    kill_timeout: 5000
  }]
};
