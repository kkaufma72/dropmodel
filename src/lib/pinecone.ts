import { Pinecone } from "@pinecone-database/pinecone";

let _pinecone: Pinecone | null = null;

export function getPinecone() {
  if (!_pinecone) {
    _pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }
  return _pinecone;
}

/** @deprecated Use getPinecone() instead */
export const pinecone = new Proxy({} as Pinecone, {
  get(_target, prop, receiver) {
    return Reflect.get(getPinecone(), prop, receiver);
  },
});

export function getIndex() {
  return getPinecone().index(process.env.PINECONE_INDEX!);
}
