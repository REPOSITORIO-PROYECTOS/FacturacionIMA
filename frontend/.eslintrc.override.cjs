// Override para build de producción: no bloquear por 'no-explicit-any'
module.exports = {
    rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
    },
};