const { execSync } = require('child_process');

module.exports = {
    checkDependencies: function() {
        const dependencies = ['bcryptjs', 'uuid', 'socket.io', 'express', 'cors'];

        console.log('🔍 Проверка зависимостей...');

        dependencies.forEach(dep => {
            try {
                require.resolve(dep);
                console.log(`✅ ${dep} установлен`);
            } catch (err) {
                console.log(`📦 Установка ${dep}...`);
                try {
                    execSync(`npm install ${dep}`, { stdio: 'inherit', encoding: 'utf8' });
                    console.log(`✅ ${dep} установлен`);
                } catch (err) {
                    console.error(`❌ Ошибка установки ${dep}:`, err.message);
                    console.log(`Установите вручную: npm install ${dep}`);
                }
            }
        });
    }
};