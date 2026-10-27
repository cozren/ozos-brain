import { ApiError, throwIfNotOk } from '../../api'

test('throwIfNotOk surfaces the JSON detail and status, and never the request body', async () => {
  const res = new Response(
    JSON.stringify({ detail: 'ATLASSIAN_X is not a variable Setup may write' }),
    {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    }
  )
  await expect(throwIfNotOk(res, 'Write env')).rejects.toMatchObject({
    status: 422,
    detail: 'ATLASSIAN_X is not a variable Setup may write',
  })
  const plain = new Response('nope', { status: 500 })
  const err = (await throwIfNotOk(plain, 'Write env').catch((e) => e)) as ApiError
  expect(err).toBeInstanceOf(ApiError)
  expect(err.message).toBe('Write env failed: 500')
})
