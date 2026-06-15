import { expect } from 'chai';
import * as request from 'supertest';
import { createApp } from './common/app';
import { OpenAPIV3 } from '../src/framework/types';
import { date, dateTime } from '../src/framework/base.serdes';

// https://github.com/cdimascio/express-openapi-validator/issues/1177
// Serializer/Deserializer must work with arrays when the OpenAPI 3.1
// `type` keyword uses an array of options, e.g. `type: ['array', 'null']`.
const apiSpec: OpenAPIV3.DocumentV3_1 = {
  openapi: '3.1.0',
  info: { title: '1177', version: '1.0.0', summary: '' },
  servers: [{ url: '/v1/' }],
  components: {},
  webhooks: {},
  paths: {
    '/items': {
      get: {
        responses: {
          '200': {
            description: '',
            content: {
              'application/json': {
                schema: {
                  // OpenAPI 3.1 multi-option type specifier
                  type: ['array', 'null'],
                  items: {
                    type: 'object',
                    properties: {
                      created_at: { type: 'string', format: 'date-time' },
                    },
                  },
                } as any,
              },
            },
          },
        },
      },
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  properties: {
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              } as any,
            },
          },
        },
        responses: {
          '200': {
            description: '',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    typeof: { type: 'string' },
                    iso: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('issue #1177 - serdes with OpenAPI 3.1 array type specifier', () => {
  let app = null;
  const isoDate = '2026-04-06T23:07:24.515Z';

  before(async () => {
    app = await createApp(
      {
        apiSpec,
        validateRequests: { coerceTypes: true },
        validateResponses: { coerceTypes: true },
        serDes: [date, dateTime],
      },
      3005,
      (app) => {
        app.get(`${app.basePath}/items`, (req, res) => {
          // The route returns a Date object; the serializer must convert it
          // to an ISO string so response validation passes.
          res.json([{ created_at: new Date(isoDate) }]);
        });
        app.post(`${app.basePath}/items`, (req, res) => {
          // The request date-time string must be deserialized to a Date object.
          const item = req.body[0];
          if (!(item.created_at instanceof Date)) {
            throw new Error('created_at should be deserialized to a Date');
          }
          res.json({ typeof: typeof item.created_at, iso: item.created_at.toISOString() });
        });
        app.use((err, req, res, next) => {
          res.status(err.status ?? 500).json({ message: err.message, errors: err.errors });
        });
      },
      false,
    );
    return app;
  });

  after(() => {
    app.server.close();
  });

  it('serializes date-time inside array items on the response', async () =>
    request(app)
      .get(`${app.basePath}/items`)
      .expect(200)
      .then((r) => {
        expect(r.body).to.be.an('array').with.lengthOf(1);
        expect(r.body[0].created_at).to.equal(isoDate);
      }));

  it('deserializes date-time inside array items on the request', async () =>
    request(app)
      .post(`${app.basePath}/items`)
      .send([{ created_at: isoDate }])
      .set('Content-Type', 'application/json')
      .expect(200)
      .then((r) => {
        expect(r.body.typeof).to.equal('object');
        expect(r.body.iso).to.equal(isoDate);
      }));
});
