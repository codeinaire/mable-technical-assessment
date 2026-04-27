import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from "hono/logger";
import { routes } from './routes.js'

const app = new Hono()

app.use(logger());

app.route("/", routes);

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
