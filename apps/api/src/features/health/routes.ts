import { Router } from 'express';

import { getLive, getReady } from './controller.js';
import { getMetrics } from './metrics-controller.js';

export const healthRouter = Router();

healthRouter.get('/live', getLive);
healthRouter.get('/ready', getReady);

export const metricsRouter = Router();
metricsRouter.get('/', getMetrics);
