enum TodoStatus {
    Active='active',
    Completed='completed',
}

interface ITodoItem {
    name: string;
    id: number;
    status: TodoStatus;
}

abstract class ITodoDAO {
    public abstract getList() : ITodoItem[];
    public abstract create(item: Omit<ITodoItem, 'id'>) : ITodoItem;
    public abstract update(item: ITodoItem) : ITodoItem;
    public abstract delete(id: number) : void;
}

export { ITodoDAO, TodoStatus, ITodoItem };