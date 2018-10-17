// tslint:disable-next-line:function-name
export function EnsureError(message, data) {
  this.name = 'EnsureError';
  this.message = message || 'Ensure failed';
  this.data = data;
  this.stack = new Error().stack;
}
EnsureError.prototype = Object.create(Error.prototype);
EnsureError.prototype.constructor = EnsureError;
