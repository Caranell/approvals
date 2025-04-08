import { name, version } from '@root/package.json'
import { createServer } from 'http'
import request from 'supertest'

import { app } from '@/app'
import { HTTP_STATUS_CODES } from '@/types'

describe('Service Tests', () => {
    const testServer = createServer(app)

    beforeAll(async () => {
        await new Promise<void>(resolve => {
            testServer.listen(3001, '0.0.0.0', () => resolve())
        })
    })

    afterAll(async () => {
        await new Promise<void>(resolve => {
            testServer.close(() => resolve())
        })
    })

    describe('App Controller', () => {
        test('version', async () => {
            // Arrange
            const expectedData = { version, name }

            // Act
            const response = await request(app).get('/app/version')

            // Assert
            expect(response.status).toBe(HTTP_STATUS_CODES.OK)
            expect(response.body).toEqual(expectedData)
        })

        test('health check', async () => {
            // Arrange
            const expectedData = { message: 'OK' }

            // Act
            const response = await request(app).get('/app/health-check')

            // Assert
            expect(response.status).toBe(HTTP_STATUS_CODES.OK)
            expect(response.body).toEqual(expectedData)
        })
    })
})
