const isType = (type, val) => {
  return Object.prototype.toString.call(val) === `[object ${type}]`;
}
// 判断 resolve 返回的数值
const resolvePromise = (promise, x, resolve, reject) => {
  if (promise === x) {
    throw new TypeError('循环调用：then 或者 catch 不能返回当前 promise')
  }

  // 保证只执行一次
  let called = false;
  
  // 如果是一个对象或者函数, 说明可能含有 then 方法
  if (isType('Function', x) || isType('Object', x)) {
      try {
        const then = x.then;
        if (isType('Function', then)) {
          // then 是一个函数，则默认处理为返回了 promise
          then.call(
            x,
            value => {
              if (called) return
              called = true
              resolvePromise(promise, value, resolve, reject);
            }, 
            reason => {
              if (called) return
              called = true
              reject(reason);
            }
          )
        } else {
          // 普通值
          resolve(x);
        }
      } catch (err) {
        if (called) return
        called = true
        reject(err);
      }
  } else {
    // 其他数值 直接返回
    resolve(x);
  }
}
class MyPromise {
  constructor(executor) {
    // 参数校验
    if (!isType('Function', executor)) {
      throw new TypeError(`${executor} 必须是一个函数`)
    }

    // 初始化值
    this.initValue();
    this.initBind();

    // 执行 executor 回调函数
    try {
      executor(this.resolve, this.reject);
    } catch(err) {
      this.reject(err);
    }
  }

  initValue() {
    // 保存 promise 状态
    this.state = MyPromise.PENDING;
    // 保存 成功值
    this.value = null;
    // 保存 失败原因
    this.reason = null;
    // 保存 成功执行回调
    this.onResolvedCallbacks = [];
    // 保存 失败回到
    this.onRejectedCallbacks = [];
  }

  // 鉴于在 nodejs 环境中 不能在 class 中使用箭头函数，所以这里进行 this bind
  initBind() {
    this.resolve = this.resolve.bind(this);
    this.reject = this.reject.bind(this);
  }

  // 成功回调
  resolve(value) {
    // A+ 规范，状态是不可逆的
    if (this.state === MyPromise.PENDING) {
      this.state = MyPromise.FULFILLED;
      this.value = value;
      this.onResolvedCallbacks.forEach( fn => fn(this.value));
    }
  }

  // reject 回调
  reject(reason) {
    // A+ 规范，状态是不可逆的
    if (this.state === MyPromise.PENDING) {
      this.state = MyPromise.REJECTED;
      this.reason = reason;
      this.onRejectedCallbacks.forEach(fn => fn(this.reason));
    }
  }

  // 关键函数 then 方法
  then(onFulfilled, onRejected) {
    //  A+ 规范 onFulfilled, onRejected 不是函数，必须被忽略
    if (!isType('Function', onFulfilled)) {
      onFulfilled = value => value;
    }
    if (!isType('Function', onRejected)) {
      onRejected = reason => {
        throw reason
      }
    }

    // then 方法必须返回一个 promise 对象 (链式调用)
    const promise = new MyPromise((resolve, reject) => {
      if (this.state === MyPromise.FULFILLED) {
        // 为了保证输出顺序，使用事件循环
        setTimeout(() => {
          try {
            const x = onFulfilled(this.value);
            resolvePromise(promise, x, resolve, reject);
          } catch (err) {
            reject(err);
          }
        }, 0);
      }

      if (this.state === MyPromise.REJECTED) {
        setTimeout(() => {
          try {
            const x = onRejected(this.reason);
            resolvePromise(promise, x, resolve, reject);
          } catch (err) {
            reject(err);
          }
        }, 0);
      }

      // 当 promise 中执行是一个异步函数是，因为 then 方法会马上调用，所以这里把需要执行的函数保存，方便后面调用
      if (this.state === MyPromise.PENDING) {
        this.onResolvedCallbacks.push(() => {
          setTimeout(() => {
            try {
              const x = onFulfilled(this.value);
              resolvePromise(promise, x, resolve, reject);
            } catch (err) {
              reject(err);
            }
          }, 0);
        });
        this.onRejectedCallbacks.push(() => {
          setTimeout(() => {
            try {
              const x = onRejected(this.reason);
              resolvePromise(promise, x, resolve, reject);
            } catch (err) {
              reject(err);
            }
          }, 0);
        })
      }
    })
    
    return promise;
  }
  catch(fn) {
    return this.then(null, fn);
  }
}
MyPromise.PENDING = 'pending';
MyPromise.FULFILLED = 'fulfilled';
MyPromise.REJECTED = 'rejected';

//resolve 方法
MyPromise.resolve = function(value) {
  return new MyPromise(resolve => {
    resolve(value);
  })
}

// reject 方法
MyPromise.reject = function(reason) {
  return new MyPromise((resolve, reject) => {
    reject(reason);
  })
}

// race 方法 有一个成功，就返回
MyPromise.race = function(promises) {
  return new MyPromise((resolve, reject) => {
    promises.forEach(promise => {
      promise.then(resolve, reject);
    })
  })
}

// all 方法 所有结果返回正确才 ok
MyPromise.all = function(promises) {
  let data = [];
  let count = 0;
  let len = promises.length;

  const dealData = ({index, res, resolve}) => {
    data[index] = res;
    count++;
    if (count === len) {
      resolve(data);
    }
  }

  return new MyPromise((resolve, reject) => {
    promises.forEach((promise, index) => {
      const then = promise.then;
      // promise 可能不是一个 Promise 对象
      if (isType('Function', then)) {
        promise.then(res => {
          dealData({index, res, resolve});
        }, reject)
      } else {
        dealData({index, res: promise, resolve});
      }
    })
  })
}

module.exports = MyPromise
