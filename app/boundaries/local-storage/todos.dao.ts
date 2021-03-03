import { ITodoDAO, ITodoItem } from "../../todo-mvc/todos.dao";

class TodoDAO extends ITodoDAO {
    public getList(): ITodoItem[] {
        return this.getExistingItems();
    }
    public create(item: Pick<ITodoItem, "name" | "status">): ITodoItem {
        const existingItems = this.getExistingItems();

        let id = 1;
        if(existingItems.length){
            id = existingItems[existingItems.length - 1].id + 1;
        }

        const newTodo = {
            ...item,
            id: id,
        }

        existingItems.push(newTodo);
        this.saveExistingItems(existingItems);
        return newTodo;
    }
    public update(item: ITodoItem): ITodoItem {
        const existingItems = this.getExistingItems();
        const persistedItem = existingItems.find(x => x.id === item.id);
        if(persistedItem){
            persistedItem.name = item.name;
            persistedItem.status = item.status;
        }
        this.saveExistingItems(existingItems);
        return persistedItem;
    }
    public delete(id: number): void {
        const existingItems = this.getExistingItems();
        const persistedItemIndex = existingItems.findIndex(x => x.id === id);
        existingItems.splice(persistedItemIndex, 1);
        this.saveExistingItems(existingItems);
    }

    private getExistingItems() {
        const existingCollection = localStorage.getItem('todos');
        let todoList: ITodoItem[] = [];

        if(existingCollection) {
            todoList = JSON.parse(existingCollection);
        }

        return todoList.sort((a, b) => a.id - b.id);
    }

    private saveExistingItems(todos: ITodoItem[]) {
        const stringigied = JSON.stringify(todos);
        localStorage.setItem('todos', stringigied);
    }
}

export { TodoDAO };