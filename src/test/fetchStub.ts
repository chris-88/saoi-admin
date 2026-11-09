import type { Mock } from 'vitest'

/**
 * `openapi-fetch` calls `fetch(request)` with a `Request`; the tests read calls as
 * `(url, init)`. This turns the one into the other before the mock sees it, so a test can
 * assert on the URL, the method, the headers and the body as they went out.
 *
 * A JSON body arrives as its string, a multipart body as the `FormData` the request carried,
 * and no body as `undefined`.
 */
export function viaRequest(fetchMock: Mock<typeof fetch>): typeof fetch {
  return async (input, init) => {
    if (!(input instanceof Request)) return fetchMock(input, init)
    const type = input.headers.get('Content-Type') ?? ''
    let body: BodyInit | undefined
    if (type.startsWith('multipart/form-data')) body = await input.formData()
    else {
      const text = await input.text()
      body = text === '' ? undefined : text
    }
    return fetchMock(input.url, {
      method: input.method,
      headers: input.headers,
      signal: input.signal,
      ...(body === undefined ? {} : { body }),
    })
  }
}
