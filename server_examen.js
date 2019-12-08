const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios')
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;


const myFormat = printf(({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
});


const logger = createLogger({
    level: 'debug',
    format: combine(
        label({ label: 'exam' }), timestamp(),
        myFormat
    ),
    defaultMeta: { service: 'user-service' },
    transports: [
        new transports.File({ filename: 'requests.log' }),
        new transports.Console()
    ]
});


const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let events = [];

const key = '999111222';


addWeatherToEvent = async (place) => {
    const result = await axios.get(`http://api.openweathermap.org/data/2.5/weather?APPID=47a7d41dda42ab2b76f1abc11824a880&q=${place}`);
    return result.data;
}

//Middleware para hacer log de una peticion de red
app.use((req, res, next) => {
    logger.info(`Peticion de red: ${req.method} ${req.headers.host}${req.url}`);
    next();
});

// Middleware para comprobar si la llamada de red tiene apikey
app.use((req, res, next) => {
    const incomingKey = req.query.key;

    if (incomingKey !== key) {
        res.status(403).send('apiKey incorrecta');
        return
    }
    next();
});


app.get('/events', async (req, res) => {

    const filters = {}

    if (req.query['type'] !== undefined && req.query['type'].trim() !== '') {
        filters['type'] = req.query['type'].trim();
    }

    if (req.query['place'] !== undefined && req.query['place'].trim() !== '') {
        filters['place'] = req.query['place'].trim();
    }

    for (let key of Object.keys(req.query)) {
        if (filters[key] === undefined && key !== 'key') {
            res.status(400).send('Filtros mal configurados');
            return;
        }
    }


    let filteredEvents = events.slice();



    for (let key of Object.keys(filters)) {
        filteredEvents = filteredEvents.filter(item => filters[key].toLowerCase() === item[key].toLowerCase());
    }


    // En esta solucion añado el campo weather mediante un map , creando una promesa para cada elemento del array
    // y resolviendo estas promesas con un Promise.all. El problema que tiene esta solución es que repite llemadas
    // para la misma ciudad. En la siguiente solución hago solo una llamada a la API por cada ciudad

    // const filteredEventsWithWeather = filteredEvents.map(async item => {
    //     item.weather = await addWeatherToEvent(item.place.toLowerCase());
    //     return item;
    // });

    // Promise.all(filteredEventsWithWeather)
    // .then(results => {
    //     res.send(results);
    // })
    // .catch(error => {
    //     res.status(500).send('error en la red')
    // })


    //Aqui creo un objeto con una clave por cada lugar distinto y le asigno una promesa al llamar a la funcion
    //addWeatherEvent con ese lugar. Resuelvo las promesas con Promise.all y le asigno a cada evento el tiempo 
    //correspondiente a cada ciudad. Esta solucion es algo más eficiente porque solo llama a la api una vez
    //por ciudad . Devuelvo solamente el campo weather del objeto que devuelve la funcion

    const objPlaces = {};

    for (let obj of filteredEvents) {
        let place = obj['place'].toLowerCase();
        if (objPlaces[place] === undefined) {
            objPlaces[place] = await addWeatherToEvent(place);
        }
    }

    Promise.all(Object.values(objPlaces))
    .then(results =>{
        for (let obj of filteredEvents) {
            let place = obj['place'].toLowerCase();
            obj['weather'] = objPlaces[place]['weather'];
        }
        res.send(filteredEvents);
    })
    .catch(error => {
        res.status(500).send('error en la red');
    })
});

app.post('/events', function (req, res) {


    event = {};

    event['name'] = req.body['name'].trim();
    event['type'] = req.body['type'].trim();
    event['date'] = req.body['date'].trim();
    event['place'] = req.body['place'].trim();


    for (let key of Object.keys(event)) {
        if (event[key] === undefined || event[key] === '') {
            res.send(400).send('formato de los datos incorrecto');
            return;
        }
    }


    if (req.body['description'] !== undefined && req.body['description'].trim() !== '') {
        event['description'] = req.body['description'].trim();
    }

    for (let key of Object.keys(req.body)) {
        if (event[key] === undefined) {
            res.status(400).send('Campos del objeto erróneos');
            return;
        }
    }

    for (let item of events) {
        if (item['name'] === event['name'] && item['type'] === event['type']
            && item['date'] === event['date'] && item['place'] === event['place']) {
            res.status(409).send('El evento ya existe');
            return;
        }
    }

    events.push(event);

    res.send();
});







app.listen(3000, function () {
    console.log('servidor arrancado en el puerto 3000');
});