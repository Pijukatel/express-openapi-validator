import * as path from 'path';
import { expect } from 'chai';
import * as request from 'supertest';
import { createApp } from './common/app';

import { date, dateTime } from '../src/framework/base.serdes';
import { AppWithServer } from './common/app.common';

// https://github.com/cdimascio/express-openapi-validator/issues/1177
// The serializer/deserializer must descend into array `items` even when the
// OpenAPI 3.1 `type` keyword is an array of options, e.g. `type: [array, 'null']`.
const apiSpecPath = path.join('test', 'resources', '1177.yaml');

describe('issue #1177 - serdes with OpenAPI 3.1 array type specifier', () => {
  let app: AppWithServer;
  const isoDate = '2026-04-06T23:07:24.515Z';

  before(async () => {
    // set up express app
    app = await createApp(
      {
        apiSpec: apiSpecPath,
        validateRequests: {
          coerceTypes: true,
        },
        validateResponses: {
          coerceTypes: true,
        },
        serDes: [date, dateTime],
      },
      3005,
      (app) => {
        app.get([`${app.basePath}/items`], (req, res) => {
          // The route returns a Date object; the serializer must convert it to
          // an ISO string so response validation passes.
          res.json([{ created_at: new Date(isoDate) }]);
        });
        app.post([`${app.basePath}/items`], (req, res) => {
          // The request date-time string must be deserialized to a Date object.
          if (!(req.body[0].created_at instanceof Date)) {
            throw new Error('Should be deserialized to Date object');
          }
          res.json(req.body);
        });
        app.get([`${app.basePath}/nullable-items`], (req, res) => {
          // A nullable date-time field must serialize a not-yet-serialized
          // Date object and still allow null.
          res.json([{ created_at: new Date(isoDate) }, { created_at: null }]);
        });
        app.use((err, req, res, next) => {
          res.status(err.status ?? 500).json({
            message: err.message,
            code: err.status ?? 500,
          });
        });
      },
      false,
    );
    return app;
  });

  after(() => {
    app.server.close();
  });

  it('should serialize date-time inside array items on the response', async () =>
    request(app)
      .get(`${app.basePath}/items`)
      .expect(200)
      .then((r) => {
        expect(r.body[0].created_at).to.equal(isoDate);
      }));

  it('should deserialize then serialize date-time inside array items', async () =>
    request(app)
      .post(`${app.basePath}/items`)
      .send([{ created_at: isoDate }])
      .set('Content-Type', 'application/json')
      .expect(200)
      .then((r) => {
        expect(r.body[0].created_at).to.equal(isoDate);
      }));

  it('should serialize an unserialized Date and allow null for a nullable date-time item', async () =>
    request(app)
      .get(`${app.basePath}/nullable-items`)
      .expect(200)
      .then((r) => {
        expect(r.body[0].created_at).to.equal(isoDate);
        expect(r.body[1].created_at).to.equal(null);
      }));
});
