import * as mobx from 'mobx';
import { IViewModel } from '../lib/with-vm';
import { TodoDAO } from '../local-storage/todos.dao';
import { ITodoDAO, ITodoItem, TodoStatus } from "./todos.dao";
import { createContext } from 'react';
import { createConnect } from '../lib/make-context';

interface ITodoMvcVMProps {
    status: TodoStatus;
}

class TodosVM implements IViewModel<ITodoMvcVMProps> {
    @mobx.observable
    private todoList: ITodoItem[];

    constructor(props: ITodoMvcVMProps, private readonly todoDao: ITodoDAO = new TodoDAO()) {
        this.todoList = [];
        mobx.makeObservable(this);
    }

    public initialize() {
        this.todoList = this.todoDao.getList();
    }

    public createTodo = (name: string) => {
        const newTodo = this.todoDao.create({
            name: name,
            status: TodoStatus.Active,
        })
        this.todoList.push(newTodo);
    }

    public getTodoItems = (filter?: TodoStatus) => {
        return this.todoList.filter(x => !filter || x.status === filter) as ReadonlyArray<Readonly<ITodoItem>>;
    }

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

    public setAllStatus = (newStatus: TodoStatus) => {
        for(const item of this.todoList){
            if(newStatus !== item.status) {
                item.status = newStatus;
                this.todoDao.update(item);
            }
        }
    }

    public removeTodo = (id: number) => {
        const targetItemIndex = this.todoList.findIndex(x => x.id === id);
        this.todoList.splice(targetItemIndex, 1);
        this.todoDao.delete(id);
    }

    public removeCompletedTodos = () => {
        const completedItems = this.todoList.filter(x => x.status === TodoStatus.Completed);
        this.todoList = this.todoList.filter(x => x.status === TodoStatus.Active);
        for(const completedTodo of completedItems){
            this.todoDao.delete(completedTodo.id);
        }
    }
}

const TodosVMContext = createContext<TodosVM>(null);
const connectTodosVM = createConnect(TodosVMContext);

export { TodosVM, ITodoMvcVMProps, TodosVMContext, connectTodosVM };