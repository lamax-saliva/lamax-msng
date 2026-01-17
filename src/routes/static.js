const express = require('express');
const path = require('path');

module.exports = function(app) {
    // Статические файлы из public
    app.use('/static', express.static(path.join(__dirname, '../public')));
    app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

    // САМОЕ ВАЖНОЕ: Добавьте эту строку - раздаем файлы из views
    app.use(express.static(path.join(__dirname, '../views')));

    // Также раздаем файлы из корня
    app.use(express.static(path.join(__dirname, '..')));

    // Favicon
    app.get('/favicon.ico', (req, res) => {
        const faviconPath = path.join(__dirname, '../public/favicon.ico');
        res.sendFile(faviconPath, (err) => {
            if (err) {
                // Если нет favicon, ничего не делаем
                res.status(204).end();
            }
        });
    });

    console.log('✅ Static middleware настроен. CSS доступны по:');
    console.log('   /styles.css → views/styles.css');
    console.log('   /auth.css → views/auth.css');
    console.log('   /static/* → public/*');
};