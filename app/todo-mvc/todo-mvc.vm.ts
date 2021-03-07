import * as mobx from 'mobx';
import { IViewModel } from '../framework-extensions/with-vm';
import { TodoDAO } from '../boundaries/local-storage/todos.dao';
import { ITodoDAO, ITodoItem, TodoStatus } from "./todos.dao";
import { createConnect } from '../framework-extensions/create-connect';

// viewmodel does not depends on specific execution context, therefore set props to 'unknown'
class TodosVM implements IViewModel<{ status: TodoStatus }> {
    @mobx.observable
    private todoList: ITodoItem[];

    // we don't have any IoC container plugged in for the application so concrete instance is plugged in explicitely
    constructor(props: { status: TodoStatus }, private readonly todoDao: ITodoDAO = new TodoDAO()) {
        this.todoList = [];
    }

    @mobx.action
    public initialize() {
        this.todoList = this.todoDao.getList();
    }

    @mobx.action
    public createTodo = (name: string) => {
        if(!name || name.trim() === '') {
            // do not let to create
            return; 
        }

        const newTodo = this.todoDao.create({
            name: name,
            status: TodoStatus.Active,
        })
        this.todoList.push(newTodo);
    }

    public getTodoItems = (filter?: TodoStatus) => {
        return this.todoList.filter(x => !filter || x.status === filter) as ReadonlyArray<Readonly<ITodoItem>>;
    }

    @mobx.action
    public toggleStatus = (id: number) => {
        const targetItem = this.todoList.find(x => x.id === id);
        if(targetItem) {
            switch(targetItem.status){
                case TodoStatus.Active:
                    targetItem.status = TodoStatus.Completed;
                    break;
                case TodoStatus.Completed:
                    targetItem.status = TodoStatus.Active;
                    break;
            }
        }
        
        this.todoDao.update(targetItem);
    }

    @mobx.action
    public setAllStatus = (newStatus: TodoStatus) => {
        for(const item of this.todoList){
            if(newStatus !== item.status) {
                item.status = newStatus;
                this.todoDao.update(item);
            }
        }
    }

    @mobx.action
    public removeTodo = (id: number) => {
        const targetItemIndex = this.todoList.findIndex(x => x.id === id);
        this.todoList.splice(targetItemIndex, 1);
        this.todoDao.delete(id);
    }

    @mobx.action
    public removeCompletedTodos = () => {
        const completedItems = this.todoList.filter(x => x.status === TodoStatus.Completed);
        this.todoList = this.todoList.filter(x => x.status === TodoStatus.Active);
        for(const completedTodo of completedItems){
            this.todoDao.delete(completedTodo.id);
        }
    }
}

const connectTodosVM = createConnect(TodosVM);

export { TodosVM, connectTodosVM };