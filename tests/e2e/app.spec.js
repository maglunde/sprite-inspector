import { expect, test } from '@playwright/test'

const svgImage = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" viewBox="0 0 96 64">
  <rect width="96" height="64" fill="#0f172a" />
  <rect x="8" y="8" width="24" height="24" fill="#f97316" />
  <rect x="48" y="16" width="20" height="20" fill="#38bdf8" />
</svg>
`

async function uploadFixture(page) {
  await page.getByLabel('Choose sprite or image').setInputFiles({
    name: 'fixture.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgImage),
  })
}

test('uploads an image and shows frame output', async ({ page }) => {
  await page.goto('/')

  await uploadFixture(page)

  await expect(page.getByText('fixture.svg')).toBeVisible()
  await expect(page.getByText('0, 0, 32, 32')).toBeVisible()
  await expect(page.getByText('96 × 64px')).toBeVisible()
})

test('clicking the image centers the selection on the clicked point', async ({ page }) => {
  await page.goto('/')
  await uploadFixture(page)

  const image = page.getByAltText('Uploaded sprite')
  const box = await image.boundingBox()
  if (!box) throw new Error('Image bounding box was not available')

  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5)

  await expect(page.getByText('56, 16, 32, 32')).toBeVisible()
})

test('copy action copies frame arguments', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await uploadFixture(page)

  await page.getByRole('button', { name: /copy region as x, y, width, height arguments/i }).click()

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText).toBe('0, 0, 32, 32')
})
