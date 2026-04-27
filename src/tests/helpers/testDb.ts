import { createDb } from "../../db/index.js"

export const TEST_DB_PATH = "./mable-backend-assessment-test.db"

export const createTestDb = () => createDb(":memory:")
