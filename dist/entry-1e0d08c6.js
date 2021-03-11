import { r as react, u as useObserver, m as makeObservable, _ as __decorate, o as observable, a as __metadata, b as action, L as Link, c as reactDom, B as BrowserRouter, R as Route } from './vendor-07b688f0.js';

/**
 * let subscribe to mount status
 */
const useIsMount = () => {
    const isMountRef = react.useRef(true);
    react.useEffect(() => {
        isMountRef.current = true;
        return () => {
            isMountRef.current = false;
        };
    });
    return isMountRef;
};
/**
 * similar to useState, but setState is being invoked only if component is not yet unmounted
 */
const useStateSafe = (initialState) => {
    const mountStatus = useIsMount();
    const useStateResult = react.useState(initialState);
    const setStateUnsafe = useStateResult[1];
    const setStateSafe = (value) => {
        // prevent calling setState on unmounted components
        if (mountStatus.current) {
            setStateUnsafe(value);
        }
    };
    useStateResult[1] = setStateSafe;
    return useStateResult;
};

const contextRegistry = {};
/**
 * build connect function, which takes properties from the viewmodel, set into context of provided type
 * @param context - if not passed - create new react context and return in alongside the connect function
 */
const createConnect = (constructorType) => {
    if (contextRegistry[constructorType.name]) {
        throw new Error(`unable to create context for constructor '${constructorType.name}'. Context has been already created`);
    }
    const context = react.createContext(null);
    // todo: instead of using bold 'name' add some seed to the constructor dynamically on first createConnect call
    contextRegistry[constructorType.name] = context;
    // merge properties derived from context with own properties of compoent
    return (ComponnetToConnect, mapVMToProps) => {
        const wrappedHOC = (ownProps) => {
            const ctxData = react.useContext(context);
            // utilize useObserver instead of <Observer> in order to make react devtools more useful
            const ObserverComponent = useObserver(() => {
                const contextProps = mapVMToProps(ctxData, ownProps);
                const fullProps = Object.assign(Object.assign({}, ownProps), contextProps);
                return react.createElement(ComponnetToConnect, Object.assign({}, fullProps));
            });
            return ObserverComponent;
        };
        // for react devtools, sik. todo: don't apply in dev env
        wrappedHOC.displayName = (ComponnetToConnect.displayName || ComponnetToConnect.name) + '_connected_' + constructorType.name;
        return wrappedHOC;
    };
};

/**
 * make function, which bind the viewmodel to the component
 * Wraps react component by passing prepared viewmodel into it as a separate prop
 * Should be used if vmFactory is overriden if we want to utilize IoC container for viewmodel instances creation
 * Otherwise - use default 'withVM' function
 * @param vmFactory - factory, used for creation of the viewmodel from it's constructor and initial props passed to the component
 */
const makeWithVM = (vmFactory) => (Component, VMConstructor, vmPropName, depsSelector) => {
    const vmHOC = (props) => {
        const [viewModel, setViewModel] = useStateSafe(null);
        react.useEffect(() => {
            if (viewModel && viewModel.onPropsChanged) {
                viewModel.onPropsChanged(props);
            }
        });
        let isComponentRemoved = false;
        react.useEffect(() => {
            const vm = vmFactory(props, VMConstructor);
            const initializeResult = vm.initialize ? vm.initialize() : null;
            // if initialize return promise - await it first, then set viewmodel into component's state
            if (initializeResult instanceof Promise) {
                initializeResult.then(() => {
                    if (!isComponentRemoved) {
                        setViewModel(vm);
                        // todo: doublecheck whether cleanup should be enforced here, likely it shouldn't as it is supposed to be cleaned up in 
                        // effect's return function 
                        // vm && vm.cleanup && vm.cleanup()
                    }
                    // let expection be propagated (if any). Exceptions, thrown within the lifecicle methods, is not a subject for handling within this hook
                });
            }
            else {
                // if initialize return something other than promise or not exists - set viewmodel right away
                setViewModel(vm);
            }
            return () => {
                if (vm && vm.cleanup) {
                    vm.cleanup();
                }
                isComponentRemoved = true;
            };
        }, depsSelector ? depsSelector(props) : []);
        if (viewModel) {
            const propsWithVM = Object.assign({}, props);
            // if property is suppsed to be injected into the component, hosting the viewmodel - pass it as a new prop
            if (vmPropName) {
                // todo: investigate why "Type 'IViewModel<TProps>' is not assignable to type 'TFullProps[TVMPropName]'
                propsWithVM[vmPropName] = viewModel;
            }
            const ContextInstance = contextRegistry[VMConstructor.name];
            return (react.createElement(ContextInstance.Provider, { value: viewModel },
                react.createElement(Component, Object.assign({}, propsWithVM))));
        }
        else {
            return null;
        }
    };
    // todo: get rid of this while not in development env
    vmHOC.displayName = Component.displayName || VMConstructor.name + '_host';
    return vmHOC;
};
/**
 * Create persistent viewmodel from react props.
 * Wraps react component into the context, which provide the instance of viewmodel
 * if 'vmPropName' parameter is present - pass viewmodel as a property to the Component
 * @param Component - component, which receive viewmodel in a prop named after 'vmPropName' argument if 'vmPropName' is provided
 * @param VMConstructor - constructor of the viewmodel. Viewmodel will be created using 'new' operator with this constructor
 *  and passing component's props as a first argument of the constructor
 * @param depsSelector - if returns an array - this array is passed to 'deps' argument of react's useEffect hook
 *  to let viewmodel be rebuilt if needed on specific props change. If does not return anything - empty array is passed to the useEffect,
 *  so single viemodel instance is active throught the whole lifetime of component instance.
 * @param vmPropName - name of the prop, used for viewmodel injection.
 */
const withVM = makeWithVM((props, Constructor) => makeObservable(new Constructor(props)));

var TodoStatus;
(function (TodoStatus) {
    TodoStatus["Active"] = "active";
    TodoStatus["Completed"] = "completed";
})(TodoStatus || (TodoStatus = {}));
class ITodoDAO {
}

class TodoDAO extends ITodoDAO {
    getList() {
        return this.getExistingItems();
    }
    create(item) {
        const existingItems = this.getExistingItems();
        let id = 1;
        if (existingItems.length) {
            id = existingItems[existingItems.length - 1].id + 1;
        }
        const newTodo = Object.assign(Object.assign({}, item), { id: id });
        existingItems.push(newTodo);
        this.saveExistingItems(existingItems);
        return newTodo;
    }
    update(item) {
        const existingItems = this.getExistingItems();
        const persistedItem = existingItems.find(x => x.id === item.id);
        if (persistedItem) {
            persistedItem.name = item.name;
            persistedItem.status = item.status;
        }
        this.saveExistingItems(existingItems);
        return persistedItem;
    }
    delete(id) {
        const existingItems = this.getExistingItems();
        const persistedItemIndex = existingItems.findIndex(x => x.id === id);
        existingItems.splice(persistedItemIndex, 1);
        this.saveExistingItems(existingItems);
    }
    getExistingItems() {
        const existingCollection = localStorage.getItem('todos');
        let todoList = [];
        if (existingCollection) {
            todoList = JSON.parse(existingCollection);
        }
        return todoList.sort((a, b) => a.id - b.id);
    }
    saveExistingItems(todos) {
        const stringigied = JSON.stringify(todos);
        localStorage.setItem('todos', stringigied);
    }
}

// viewmodel does not depends on specific execution context, therefore set props to 'unknown'
class TodosVM {
    // we don't have any IoC container plugged in for the application so concrete instance is plugged in explicitely
    constructor(props, todoDao = new TodoDAO()) {
        this.todoDao = todoDao;
        this.createTodo = (name) => {
            if (!name || name.trim() === '') {
                // do not let to create
                return;
            }
            const newTodo = this.todoDao.create({
                name: name,
                status: TodoStatus.Active,
            });
            this.todoList.push(newTodo);
        };
        this.getTodoItems = (filter) => {
            return this.todoList.filter(x => !filter || x.status === filter);
        };
        this.toggleStatus = (id) => {
            const targetItem = this.todoList.find(x => x.id === id);
            if (targetItem) {
                switch (targetItem.status) {
                    case TodoStatus.Active:
                        targetItem.status = TodoStatus.Completed;
                        break;
                    case TodoStatus.Completed:
                        targetItem.status = TodoStatus.Active;
                        break;
                }
            }
            this.todoDao.update(targetItem);
        };
        this.setAllStatus = (newStatus) => {
            for (const item of this.todoList) {
                if (newStatus !== item.status) {
                    item.status = newStatus;
                    this.todoDao.update(item);
                }
            }
        };
        this.removeTodo = (id) => {
            const targetItemIndex = this.todoList.findIndex(x => x.id === id);
            this.todoList.splice(targetItemIndex, 1);
            this.todoDao.delete(id);
        };
        this.removeCompletedTodos = () => {
            const completedItems = this.todoList.filter(x => x.status === TodoStatus.Completed);
            this.todoList = this.todoList.filter(x => x.status === TodoStatus.Active);
            for (const completedTodo of completedItems) {
                this.todoDao.delete(completedTodo.id);
            }
        };
        this.todoList = [];
    }
    initialize() {
        this.todoList = this.todoDao.getList();
    }
}
__decorate([
    observable,
    __metadata("design:type", Array)
], TodosVM.prototype, "todoList", void 0);
__decorate([
    action,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TodosVM.prototype, "initialize", null);
__decorate([
    action,
    __metadata("design:type", Object)
], TodosVM.prototype, "createTodo", void 0);
__decorate([
    action,
    __metadata("design:type", Object)
], TodosVM.prototype, "toggleStatus", void 0);
__decorate([
    action,
    __metadata("design:type", Object)
], TodosVM.prototype, "setAllStatus", void 0);
__decorate([
    action,
    __metadata("design:type", Object)
], TodosVM.prototype, "removeTodo", void 0);
__decorate([
    action,
    __metadata("design:type", Object)
], TodosVM.prototype, "removeCompletedTodos", void 0);
const connectTodosVM = createConnect(TodosVM);

const dullPluralize = (itemsNumber) => {
    return itemsNumber === 1 ? 'item' : 'items';
};
const FooterDisconnected = (props) => {
    return react.createElement("footer", { className: "footer" },
        react.createElement("span", { className: "todo-count" },
            react.createElement("strong", null, props.activeItemsCount),
            " ",
            dullPluralize(props.activeItemsCount),
            " left"),
        react.createElement("ul", { className: "filters" },
            react.createElement("li", null,
                react.createElement(Link, { to: '/', className: !props.selectedStatus ? 'selected' : '' }, "All")),
            react.createElement("li", null,
                react.createElement(Link, { to: '/active', className: props.selectedStatus === TodoStatus.Active ? 'selected' : '' }, "active")),
            react.createElement("li", null,
                react.createElement(Link, { to: '/completed', className: props.selectedStatus === TodoStatus.Completed ? 'selected' : '' }, "completed"))),
        props.completedItemsCount
            ? react.createElement("button", { className: "clear-completed", onClick: props.clearCompleted }, "Clear completed")
            : null);
};
const Footer = connectTodosVM(FooterDisconnected, (vm, ownProps) => {
    return {
        clearCompleted: vm.removeCompletedTodos,
        activeItemsCount: vm.getTodoItems(TodoStatus.Active).length,
        completedItemsCount: vm.getTodoItems(TodoStatus.Completed).length,
    };
});

const HeaderDisconnected = (props) => {
    const handleBlur = (e) => {
        e.currentTarget.value = '';
    };
    const handleClick = (e) => {
        if (e.key === 'Enter') {
            const value = e.currentTarget.value;
            e.currentTarget.value = '';
            props.createTodo(value);
        }
        if (e.key === 'Escape') {
            e.currentTarget.value = '';
        }
    };
    return (react.createElement("header", { className: "header" },
        react.createElement("h1", null, "todos"),
        react.createElement("input", { className: "new-todo", placeholder: "What needs to be done?", autoFocus: true, onKeyDown: handleClick, onBlur: handleBlur })));
};
const Header = connectTodosVM(HeaderDisconnected, vm => {
    return {
        createTodo: vm.createTodo,
    };
});

const TodoItemDisconnected = (props) => {
    const className = props.status === TodoStatus.Completed ? 'completed' : '';
    return react.createElement("li", { className: className },
        react.createElement("div", { className: "view" },
            react.createElement("input", { className: "toggle", type: "checkbox", onChange: props.toggleStatus, checked: props.status === TodoStatus.Completed }),
            react.createElement("label", null, props.name),
            react.createElement("button", { className: "destroy", onClick: props.removeTodo })));
};
const TodoItem = connectTodosVM(TodoItemDisconnected, (vm, ownProps) => {
    return {
        toggleStatus: () => vm.toggleStatus(ownProps.id),
        removeTodo: () => vm.removeTodo(ownProps.id),
    };
});

const TodoListDisconnected = (props) => (react.createElement("section", { className: "main" },
    react.createElement("input", { id: "toggle-all", className: "toggle-all", type: "checkbox", onClick: props.setStatusForAllItems }),
    react.createElement("label", { htmlFor: "toggle-all" }, "Mark all as complete"),
    react.createElement("ul", { className: "todo-list" }, props.visibleItems.map(x => react.createElement(TodoItem, Object.assign({ key: x.id }, x))))));
const TodoList = connectTodosVM(TodoListDisconnected, (vm, ownProps) => {
    const hasActiveItems = vm.getTodoItems(TodoStatus.Active).length;
    const hasCompletedItems = vm.getTodoItems(TodoStatus.Completed).length;
    const areAllItemsCompleted = hasCompletedItems && !hasActiveItems;
    return {
        setStatusForAllItems: () => vm.setAllStatus(areAllItemsCompleted ? TodoStatus.Active : TodoStatus.Completed),
        areAllItemsCompleted: areAllItemsCompleted,
        visibleItems: vm.getTodoItems(ownProps.status),
    };
});

const TodoMvcDisconnected = (props) => {
    return react.createElement("section", { className: "todoapp" },
        react.createElement(Header, null),
        react.createElement(TodoList, { status: props.status }),
        react.createElement(Footer, { selectedStatus: props.status }));
};
const TodoMVC = withVM(TodoMvcDisconnected, TodosVM);

const basePath = 'todomvc-mobx-react-mvvm/';
reactDom.render(react.createElement(react.StrictMode, null,
    react.createElement(BrowserRouter, { basename: basePath },
        react.createElement(Route, { path: "/:todostatus?", render: ({ match }) => {
                return react.createElement(react.Fragment, null,
                    react.createElement(TodoMVC, { status: match.params.todostatus }));
            } }),
        react.createElement("footer", { className: "info" },
            react.createElement("p", null, "Double-click to edit a todo"),
            react.createElement("p", null,
                "Created by ",
                react.createElement("a", { href: "http://todomvc.com" }, "Dani Jug")),
            react.createElement("p", null,
                "Part of ",
                react.createElement("a", { href: "http://todomvc.com" }, "TodoMVC"))))), document.getElementById('todomvc-root'));
//# sourceMappingURL=entry-1e0d08c6.js.map
