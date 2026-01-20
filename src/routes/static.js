const express = require('express');
const path = require('path');

module.exports = function(app) {
    // Статические файлы из public
    app.use('/static', express.static(path.join(__dirname, '../public')));
    app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

    // Статические файлы из static (JS, CSS)
    app.use('/static', express.static(path.join(__dirname, '../static')));

    // Раздаем файлы из views
    app.use(express.static(path.join(__dirname, '../views')));
    app.use(express.static(path.join(__dirname, '../views/css')));


    // Раздаем файлы из корня
    app.use(express.static(path.join(__dirname, '..')));

    // Favicon
    app.get('/favicon.ico', (req, res) => {
        const faviconPath = path.join(__dirname, '../public/favicon.ico');
        res.sendFile(faviconPath, (err) => {
            if (err) {
                res.status(204).end();
            }
        });
    });

    console.log('✅ Static middleware настроен');
    console.log('   /static/voice-chat.js → static/voice-chat.js');
    console.log('   /static/app.js → static/app.js');
    console.log('   /static/voice-chat.css → static/voice-chat.css');
    console.log('   /auth.css → views/auth.css');
    console.log('   /styles.css → views/styles.css');
};