'use strict';
export const errorObject: { [index: string]: any } = { value: null };

export function tryCatch(fn: (...args: any) => any, ctx: any, args: any[]) {
  try {
    return fn.apply(ctx, args);
  } catch (e) {
    errorObject.value = e;
    return errorObject;
  }
}

export function isEmpty(obj: object) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      return false;
    }
  }
  return true;
}

export function array2obj(arr: string[]) {
  const obj: { [index: string]: string } = {};
  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1];
  }
  return obj;
}
