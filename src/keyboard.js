const kb = require('./keyboard-buttons');

module.exports = {
    home: [
        [kb.home.films, kb.home.cinemas],
        [kb.home.favourite]
    ],
    films: [
        [kb.films.random],
        [kb.films.comedy, kb.films.action],
        [kb.back]
    ],
    cinemas:[
        [
            {
                text: 'Joylashuvni yuborish',
                request_location: true
            }
        ],
        [kb.back]
    ]
};
