import express from 'express'; import helmet from 'helmet'; import cookieParser from 'cookie-parser'; import rateLimit from 'express-rate-limit'; import path from 'path';
import { config } from './config'; import { auth } from './routes/auth'; import { api } from './routes/api';
const app = express();
app.use(helmet(), express.json({ limit: '1mb' }), cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60e3, limit: 50 }), auth);
app.use('/api', rateLimit({ windowMs: 60e3, limit: 120 }), api);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((e: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { console.error(e); res.status(500).json({ error: 'INTERNAL' }); });
app.listen(config.port, () => console.log(`SwiftText on :${config.port}`));
