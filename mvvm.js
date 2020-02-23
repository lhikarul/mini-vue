
class Vue {
    constructor(options) {
        this.$el = options.el;
        this.$data = options.data;

        const computed = options.computed;
        const methods = options.methods;

        // 根元素存在，編譯模板
        if (this.$el) {

            // 進行數據劫持 Object.defineProperty
            new Observer(this.$data);
            
            for (let key in computed) { // 有依賴關係
                Object.defineProperty(this.$data,key, {
                    get: () => {
                        return computed[key].call(this);
                    }
                })
            }

            for (let key in methods) { // methods
                Object.defineProperty(this,key,{
                    get () {
                        return methods[key];
                    }
                })
            }


            // 把數據獲取操作 vm 上的取值操作都代理到 vm.$data
            this.proxyVm(this.$data);

            new Compiler(this.$el,this);
        }
    }

    proxyVm (data) {
        for (let key in data) {
            Object.defineProperty(this,key, {
                get () {
                    return data[key]; 
                },
                set (newVal) {
                    data[key] = newVal;
                }
            })
        }
    }
}

class Compiler {
    constructor(el,vm) {
        // 判斷 el 屬性是不是一個元素，若不是元素就獲取
        this.vm = vm;
        this.el = this.isElementNode(el) ? el : document.querySelector(el);

        // 將當前節點中的元素放入到內存
        let fragment = this.node2fragment(this.el);

        // 把節點中的內容進行替換

        // 編譯模板，用數據編譯
        this.compile(fragment);
        // 把內容在放入頁面中
        this.el.appendChild(fragment);
    }

    compile (node) { // 編譯內存中的 DOM 節點
        const childNodes = node.childNodes;

        [...childNodes].forEach(child => {
            if (this.isElementNode(child)) {
                this.compileElement(child);

                // 如果是元素的話，需要把自己傳進去，遍例子節點
                this.compile(child);
            }else {
                this.compileText(child);
            }

        })
    }

    // 編譯元素
    compileElement(node) {
        const attributes = node.attributes;
        [...attributes].forEach(attr => { // type="text" v-model="school.name"

           const {name,value:expr} = attr;

           if (this.isDirective(name)) {
                let [,directive] = name.split('-'); // v-model,v-text,v-bind
                let [directiveName,eventName] = directive.split(':'); // v-on:click
                // 需要調用不同的指令來處理
                CompileUtil[directiveName](node,expr, this.vm, eventName);
           }
        })
    }

    // 編譯文本
    compileText (node) { // 判斷文本節點中的內容是否包含 {{}}
        const content = node.textContent;
        if (/\{\{(.+?)\}\}/.test(content)) {
            CompileUtil['text'](node,content, this.vm)
        }
    }

    isDirective (attrName) {
        return attrName.startsWith('v-');
    }

    isElementNode (node) { // 是不是元素節點
        return node.nodeType === 1;
    }

    node2fragment (node) { // 將結點移至內存
        const fragment = document.createDocumentFragment();
        let firstChild;
        while (firstChild = node.firstChild) {
            fragment.appendChild(firstChild);
        }

        return fragment;
    }
}

class Observer {
    constructor (data) {
        this.observer(data);
    }

    observer (data) {
        if (data && typeof data === 'object') {
            for (let key in data) {
                this.defineReactive(data,key,data[key]);
            }
        }
    }

    defineReactive (obj,key,value) {
        this.observer(value);

        const dep = new Dep () // 給每一個屬性添加 發布/訂閱 功能
       
        Object.defineProperty(obj,key, {
            get () {
                // 創建 watchers ，會取得對應的內容，並且把 watcher 放入全域上
                Dep.target && dep.addSub(Dep.target)
                return value;
            },
            set: (newVal) => {
                if (newVal === value) return;
                this.observer(newVal);
                value = newVal;
                dep.notify();
            }
        })
    }
}

class Watcher {
    constructor (vm,expr,cb) {
        this.vm = vm;
        this.expr = expr;
        this.cb = cb;

        // 默認先存放一個舊值
        this.oldValue = this.get();
    }

    get () {
        Dep.target = this; // 先把自己放在 this 上

        // 取值 => 將觀察者和數據關聯起來
        const value = CompileUtil.getValue(this.vm,this.expr);
        Dep.target = null; // 不取消的話，任何值取值，都會添加 watcher
        return value;
    }

    update () { // 數據變化後，會調用觀察者的 update 方法
        const newValue = CompileUtil.getValue(this.vm, this.expr);
        if (newValue !== this.oldValue) {
            this.cb(newValue);
        }
    }
}

class Dep {
    constructor () {
        this.subs = [];
    }

    addSub (watcher) {
        this.subs.push(watcher);
    }

    notify () {
        this.subs.forEach(watcher => watcher.update());
    }
}

CompileUtil = {
    getContentValue (vm,expr) { // 遍歷欲渲染的模板值，將內容重新替換成一個完整的內容
        return expr.replace(/\{\{(.+?)\}\}/g, (...arrgs) => {
            return this.getValue(vm, arrgs[1]);
        })
    },
    getValue (vm,expr) { // 根據物件屬性取到對應的數據
        return expr.split('.').reduce((data,current) => {
            return data[current]
        }, vm.$data);
    },
    html (node,expr,vm) { // v-html="message"

        const fn = this.updater['htmlUpdater'];
        new Watcher(vm,expr,(newVal) => { 
            fn(node,newVal);
        })
        const value = this.getValue(vm,expr);
        fn(node,value);
    },
    setValue (vm,expr,value) {
        expr.split('.').reduce((data,current,index,arr) => {
            if (index == arr.length - 1 ) {
                return data[current] = value;
            }
            return data[current];
        }, vm.$data);
    },
    model (node,expr,vm) { // 節點, 物件屬性, 實體
        const fn = this.updater['modelUpdater']
        new Watcher(vm,expr,(newVal) => { // 給輸入框加一個觀察者，若數據更新，會觸發此方法，賦予新的值
            fn(node,newVal);
        })

        node.addEventListener('input', (e) => {
            const value = e.target.value;
            this.setValue(vm,expr,value);
        })

        const value = this.getValue(vm,expr);
        fn(node,value);
    },
    on (node,expr,vm,eventName) {
        node.addEventListener(eventName, (e) => { // v-on:click="change" expr
           vm[expr].call(vm,e);
        })
    },
    text (node,expr,vm) {
        const fn = this.updater['textUpdater'];
        const content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
            new Watcher(vm, args[1], (newVal) => { // 給模板的每個 {{}} 都加上觀察者
                fn(node,this.getContentValue(vm,expr)); // 返回一個全的字串
            })
            return this.getValue(vm,args[1])
        })
        fn(node,content);
    },
    updater: {
        modelUpdater (node,value) { // 將數據插入節點中
            node.value = value;
        },
        textUpdater (node,value) {
            node.textContent = value;
        },
        htmlUpdater (node,value) {
            node.innerHTML = value;
        }
    }
}