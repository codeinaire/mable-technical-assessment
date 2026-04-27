import { describe, expect, it } from "vitest"
import { parseAndValidateCsv } from "../../utilities/parseAndValidateCsv.js"

describe("parseAndValidateCsv", () => {
  describe("with valid CSV rows", () => {
    it("returns every row in valid and converts amounts to integer cents", () => {
      const csv = [
        "1111234522226789,1212343433335665,500.00",
        "3212343433335755,2222123433331212,1000.00",
        "1111234522226789,2222123433331212,0.01",
      ].join("\n")

      const { valid, invalid } = parseAndValidateCsv(csv)

      expect(invalid).toHaveLength(0)
      expect(valid).toStrictEqual([
        {
          from: "1111234522226789",
          to: "1212343433335665",
          amount: 50000,
          rowNumber: 1,
        },
        {
          from: "3212343433335755",
          to: "2222123433331212",
          amount: 100000,
          rowNumber: 2,
        },
        {
          from: "1111234522226789",
          to: "2222123433331212",
          amount: 1,
          rowNumber: 3,
        },
      ])
    })
  })

  describe("with mixed valid and invalid rows", () => {
    it("keeps valid rows and reports the original row number for invalid ones", () => {
      const csv = [
        "1111234522226789,1212343433335665,500.00", // row 1: valid
        "1111234522226789,2222123433331212,xyz", // row 2: invalid amount
        "3212343433335755,2222123433331212,1000.00", // row 3: valid
      ].join("\n")

      const { valid, invalid } = parseAndValidateCsv(csv)

      expect(valid).toHaveLength(2)
      expect(invalid).toHaveLength(1)
      expect(invalid[0].rowNumber).toBe(2)
    })
  })

  describe("with multiple invalid fields on one row", () => {
    it("reports every invalid field in errors", () => {
      const csv = "bad,not-an-account,xyz"

      const { invalid } = parseAndValidateCsv(csv)

      const paths = invalid[0].errors.map((e) => e.path).sort()
      expect(paths).toEqual(["amount", "from", "to"])
    })
  })

  describe("with too few columns in a row", () => {
    it("places the row in invalid with an error on the missing field", () => {
      const csv = "1111234522226789,2222123433331212"

      const { valid, invalid } = parseAndValidateCsv(csv)

      expect(valid).toHaveLength(0)
      expect(invalid).toHaveLength(1)
      expect(invalid[0].errors.some((e) => e.path === "amount")).toBe(true)
    })
  })

  describe("with empty input", () => {
    it("returns empty valid and invalid arrays", () => {
      expect(parseAndValidateCsv("")).toEqual({ valid: [], invalid: [] })
    })
  })

  describe("amount validation", () => {
    const cases = [
      {
        scenario: "more than two decimal places",
        amount: "500.00000234234",
        expectedMessage:
          "amount must be a positive number with up to 2 decimal places",
      },
      {
        scenario: "negative number",
        amount: "-500.35",
        expectedMessage:
          "amount must be a positive number with up to 2 decimal places",
      },
      {
        scenario: "non-numeric string",
        amount: "abc",
        expectedMessage:
          "amount must be a positive number with up to 2 decimal places",
      },
      {
        scenario: "zero",
        amount: "0",
        expectedMessage: "amount must be greater than 0",
      },
    ]

    it.each(cases)("rejects $scenario", ({ amount, expectedMessage }) => {
      const csv = `1111234522226789,2222123433331212,${amount}`

      const { invalid } = parseAndValidateCsv(csv)

      expect(invalid).toHaveLength(1)
      expect(invalid[0].errors).toContainEqual({
        path: "amount",
        message: expectedMessage,
      })
    })
  })

  describe("account number validation", () => {
    const cases = [
      { scenario: "too long", value: "111123452222678912342342332" },
      { scenario: "too short", value: "111123" },
      { scenario: "non-digit characters", value: "aoeu234522226789" },
      { scenario: "empty", value: "" },
    ]

    it.each(cases)("rejects from when $scenario", ({ value }) => {
      const csv = `${value},2222123433331212,500.00`

      const { invalid } = parseAndValidateCsv(csv)

      expect(invalid).toHaveLength(1)
      expect(invalid[0].errors).toContainEqual({
        path: "from",
        message: "16-digit account number required",
      })
    })
  })
})
