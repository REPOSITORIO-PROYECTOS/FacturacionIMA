module.exports = {
  apps: [
    {
      name: "IMA-stack",
      script: "bash",
      args: "/home/sgi_user/proyectos/FacturacionIMA/start_all.sh",
      cwd: "/home/sgi_user/proyectos/FacturacionIMA",
      interpreter: "none",
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        PYTHONPATH: "/home/sgi_user/proyectos/FacturacionIMA"
      }
    }
  ]
};
